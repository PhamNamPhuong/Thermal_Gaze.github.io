(() => {
  // Soundscape controls. Volumes are linear gains from 0 to 1.
  const MASTER_VOLUME = 0.8;
  const BACKGROUND_VOLUME = 0.05;
  const HEARTBEAT_VOLUME = 0.4;
  const EYE_SOUND_MAX_VOLUME = 0.35;
  const EYE_SOUND_FADE_IN = 200;        // Milliseconds
  const EYE_SOUND_FADE_OUT = 400;       // Milliseconds
  const MOUSE_IDLE_THRESHOLD = 150;     // Milliseconds since the last movement
  const LOOP_CROSSFADE_DURATION = 0.12;  // Seconds of overlap at loop seams
  const MOUSE_SPEED_SENSITIVITY = 0.0016; // Applied to pointer speed in pixels/second

  const toggle = document.querySelector('.sound-control');
  const assetCache = new Map();
  let context;
  let master;
  let eyeLevel;
  let eyePresence;
  let fadeMaster;
  let fadeEyeLevel;
  let fadeEyePresence;
  let starting;
  let started = false;

  let enabled = false;
  let enableRevision = 0;

  let pointer;
  let lastMotion;
  let moving = false;
  let eyeTarget = 0;
  let eyeFrame;
  let idleTimer;

  // Audio mixing and loop crossfades (assisted with AI)
  // Sample the current ramp so interrupted fades stay continuous.
  function createFader(param) {
    let from = 0;
    let to = 0;
    let start = 0;
    let end = 0;
    param.value = 0;

    return (target, seconds) => {
      if (target === to) return;
      const now = context.currentTime;
      const progress = now >= end ? 1 : (now - start) / (end - start);
      from += (to - from) * Math.max(0, progress);
      to = target;
      start = now;
      end = now + seconds;
      param.cancelScheduledValues(now);
      param.setValueAtTime(from, now);
      param.linearRampToValueAtTime(to, end);
    };
  }

  function buildMixer() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    context = new AudioContext();
    master = context.createGain();
    eyeLevel = context.createGain();
    eyePresence = context.createGain();
    fadeMaster = createFader(master.gain);
    fadeEyeLevel = createFader(eyeLevel.gain);
    fadeEyePresence = createFader(eyePresence.gain);

    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 3;
    limiter.ratio.value = 16;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.16;
    eyeLevel.connect(eyePresence).connect(master);
    master.connect(limiter).connect(context.destination);
  }

  function loadAudio(file) {
    if (!assetCache.has(file)) {
      const decoded = fetch(`./assets/${file}`)
        .then((response) => {
          if (!response.ok) throw new Error(`${file} returned HTTP ${response.status}`);
          return response.arrayBuffer();
        })
        .then((bytes) => context.decodeAudioData(bytes))
        .catch((error) => {
          assetCache.delete(file);
          throw error;
        });
      assetCache.set(file, decoded);
    }
    return assetCache.get(file);
  }

  // Bake the tail-to-head overlap once. Native buffer looping then follows
  // the audio clock, with the end of the buffer leading into its first sample.
  function crossfadedLoop(clip, seconds, startTime = 0, endTime = clip.duration) {
    const rate = clip.sampleRate;
    const first = Math.round(startTime * rate);
    const last = Math.min(clip.length, Math.round(endTime * rate));
    const regionLength = last - first;
    const overlap = Math.min(Math.max(0, Math.round(seconds * rate)), Math.floor(regionLength / 3));
    const length = regionLength - overlap;
    const loop = context.createBuffer(clip.numberOfChannels, length, rate);

    const tailWeights = new Float32Array(overlap);
    const headWeights = new Float32Array(overlap);
    for (let i = 0; i < overlap; i++) {
      const angle = (Math.PI / 2) * (i / Math.max(1, overlap - 1));
      tailWeights[i] = Math.cos(angle);
      headWeights[i] = Math.sin(angle);
    }

    for (let channel = 0; channel < clip.numberOfChannels; channel++) {
      const input = clip.getChannelData(channel);
      const output = loop.getChannelData(channel);
      for (let i = 0; i < overlap; i++) {
        output[i] = input[first + length + i] * tailWeights[i] + input[first + i] * headWeights[i];
      }
      output.set(input.subarray(first + overlap, first + length), overlap);
    }
    return loop;
  }

  function filteredLayer(volume, cutoff) {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    filter.Q.value = 0;
    const gain = context.createGain();
    gain.gain.value = volume;
    filter.connect(gain).connect(master);
    return filter;
  }

  async function startLoops() {
    const [background, heartbeat, eye] = await Promise.all([
      loadAudio('backgroundsound.wav'),
      loadAudio('heartbeat.wav'),
      loadAudio('soundeye.wav')
    ]);

    const loops = [
      [crossfadedLoop(background, LOOP_CROSSFADE_DURATION), filteredLayer(BACKGROUND_VOLUME, 6500)],
      // Loop between quiet intervals to preserve the heartbeat's spacing.
      [
        crossfadedLoop(heartbeat, Math.min(0.05, LOOP_CROSSFADE_DURATION), 0.02, 13.55),
        filteredLayer(HEARTBEAT_VOLUME, 850)
      ],
      [crossfadedLoop(eye, LOOP_CROSSFADE_DURATION), eyeLevel]
    ];
    const sources = loops.map(([buffer, input]) => {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(input);
      return source;
    });
    const playAt = context.currentTime + 0.02;
    sources.forEach((source) => source.start(playAt));
    started = true;
    assetCache.clear();
  }

  // Pointer-driven audio (assisted with AI)
  function endMovement() {
    clearTimeout(idleTimer);
    cancelAnimationFrame(eyeFrame);
    idleTimer = undefined;
    eyeFrame = undefined;
    pointer = undefined;
    if (!moving) return;
    moving = false;
    fadeEyePresence(0, EYE_SOUND_FADE_OUT / 1000);
  }

  function checkIdle() {
    const remaining = MOUSE_IDLE_THRESHOLD - (performance.now() - lastMotion);
    if (remaining > 0) idleTimer = setTimeout(checkIdle, remaining);
    else endMovement();
  }

  function trackMovement(event) {
    if (event.pointerType !== 'mouse') return;
    const previous = pointer;
    const now = performance.now();
    pointer = { x: event.clientX, y: event.clientY, time: now };
    if (pointer.x < 0 || pointer.y < 0 || pointer.x >= window.innerWidth || pointer.y >= window.innerHeight) {
      endMovement();
      return;
    }
    if (!started || !enabled) return;

    const distance = previous
      ? Math.hypot(pointer.x - previous.x, pointer.y - previous.y)
      : Math.max(1, Math.hypot(event.movementX || 0, event.movementY || 0));
    if (distance === 0) return;
    const elapsed = previous && now - previous.time < MOUSE_IDLE_THRESHOLD ? now - previous.time : 16;
    const speed = distance * 1000 / Math.max(8, elapsed);
    const strength = 1 - Math.exp(-speed * MOUSE_SPEED_SENSITIVITY);
    eyeTarget = EYE_SOUND_MAX_VOLUME * (0.18 + 0.82 * strength);
    lastMotion = now;

    if (!moving) {
      moving = true;
      fadeEyePresence(1, EYE_SOUND_FADE_IN / 1000);
      idleTimer = setTimeout(checkIdle, MOUSE_IDLE_THRESHOLD);
    }
    if (!eyeFrame) {
      eyeFrame = requestAnimationFrame(() => {
        eyeFrame = undefined;
        fadeEyeLevel(eyeTarget, 0.075);
      });
    }
  }

  async function setEnabled(next) {
    const revision = ++enableRevision;
    enabled = next;
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.removeAttribute('title');

    if (!enabled) {
      endMovement();
      fadeMaster?.(0, 0.42);
      return;
    }

    try {
      if (!context) buildMixer();
      // Resume on the user gesture before loading or decoding the audio.
      const resumed = context.resume();
      starting ??= startLoops().catch((error) => {
        starting = undefined;
        throw error;
      });
      await Promise.all([resumed, starting]);
      if (revision === enableRevision) fadeMaster(MASTER_VOLUME, 0.7);
    } catch (error) {
      if (revision !== enableRevision) return;
      enabled = false;
      toggle.setAttribute('aria-pressed', 'false');
      toggle.title = 'Sound could not start. Activate the control to try again.';
      console.error('Soundscape could not start:', error);
    }
  }

  function removeFirstGestureListeners() {
    document.removeEventListener('click', onFirstGesture);
    document.removeEventListener('keydown', onFirstGesture);
  }

  function onFirstGesture(event) {
    if (!event.isTrusted || toggle.contains(event.target)) return;
    if (event.type === 'keydown' && (event.repeat || !['Enter', ' '].includes(event.key))) return;
    removeFirstGestureListeners();
    setEnabled(true);
  }

  toggle.addEventListener('click', (event) => {
    if (!event.isTrusted) return;
    removeFirstGestureListeners();
    setEnabled(!enabled);
  });
  document.addEventListener('click', onFirstGesture);
  document.addEventListener('keydown', onFirstGesture);
  window.addEventListener('pointermove', trackMovement, { passive: true });
  document.documentElement.addEventListener('pointerleave', endMovement);
  window.addEventListener('blur', endMovement);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) endMovement();
  });
})();
