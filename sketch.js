// Eye settings
const EYE_SCALE = 0.975; // Fraction of the canvas's shorter side
const MAX_ROTATION_X = 12; // Degrees
const MAX_ROTATION_Y = 16; // Degrees
const ROTATION_SMOOTHNESS = 8.5;
const PUPIL_RADIUS = 43;
const PUPIL_DEPTH = 145;
const EYE_FORWARD_ANGLE = 0.35035; // Aligns the model's aperture with the camera
const EYE_RADIUS = 206.1;
const EYE_CAMERA_DISTANCE = 560;

// Heatmap settings
const HEATMAP_FLOW_SPEED = 1.0;
const HEATMAP_DEFORMATION_SPEED = 1.0;
const HEATMAP_MERGE_STRENGTH = 0.24;
const HEATMAP_PATTERN_SCALE = 0.035;
const HEATMAP_NOISE_STRENGTH = 0.24;

// Fractal settings
const FRACTAL_SPEED = 3.0;
const ZOOM_SPEED = 2.0;
const EXPANSION_SPEED = 2.0;
const DEPTH_ZOOM_RATE = 0.012;
const MAX_ITERATIONS = 160;
const COLOR_SPEED = 0.006;
const COLOR_INTENSITY = 1.10;
const BACKGROUND_BRIGHTNESS = 0.86;
const BACKGROUND_CONTRAST = 1.04;
const BACKGROUND_RESOLUTION = 0.64; // Fraction of the canvas resolution

let eyeModel;
let corneaModel;
let eyeCamera;
let corneaShader;
let pupilShader;
let heatShader;
let heatSeed;
let heatStartedAt;
let gazePitch = 0;
let gazeYaw = 0;
let targetPitch = 0;
let targetYaw = 0;

let fractalShader;
let fractalBuffer;
let fractalCamera;
let fractalMotion;
let fractalStartedAt;

async function setup() {
  const canvas = createCanvas(window.innerWidth, window.innerHeight, WEBGL);
  canvas.parent('artwork');
  colorMode(RGB);

  pixelDensity(Math.min(window.devicePixelRatio, 2));
  eyeCamera = createCamera();
  eyeCamera.camera(0, 0, EYE_CAMERA_DISTANCE, 0, 0, 0, 0, 1, 0);
  fitEyeCamera();
  pupilShader = buildColorShader(pupilFresnel);

  try {
    noStroke();
    const modelOptions = { fileType: '.obj', normalize: true };
    eyeModel = await loadModel('assets/eye2.obj', modelOptions);
    corneaModel = await loadModel('assets/cornea.obj', modelOptions);
    corneaShader = await loadShader('cornea.vert', 'cornea.frag');
    heatShader = await loadShader('heat.vert', 'heat.frag');
    heatSeed = [random(0, 100), random(0, 100), random(0, 100)];
  } catch (error) {
    console.error('Error loading model or shader:', error);
  }

  try {
    fractalShader = await loadShader('fractal.vert', 'fractal.frag');
    const [bufferWidth, bufferHeight] = fractalBufferSize();
    fractalBuffer = createFramebuffer({
      width: bufferWidth,
      height: bufferHeight,
      density: 1,
      depth: false,
      antialias: false,
      textureFiltering: LINEAR
    });
    fractalCamera = createCamera();
    fractalCamera.ortho();
    fractalMotion = createFractalMotion();
    fractalStartedAt = millis();
  } catch (error) {
    console.error('Error loading the fractal background:', error);
  }

  heatStartedAt = millis();
  window.addEventListener('pointermove', (event) => aimEye(event, canvas.elt), {
    passive: true
  });
  document.documentElement.addEventListener('pointerleave', resetGaze);
  window.addEventListener('blur', resetGaze);
}

function draw() {
  background(10);
  if (fractalMotion) drawFractalBackground();
  if (eyeModel && corneaModel && heatShader) drawEye();
}

function windowResized() {
  resizeCanvas(window.innerWidth, window.innerHeight, true);
  if (eyeCamera) fitEyeCamera();
  if (fractalMotion) {
    fractalBuffer.resize(...fractalBufferSize());
    fractalCamera.ortho();
  }
}

// Eye framing and mouse tracking (assisted with AI)
function fitEyeCamera() {
  const diameter = EYE_SCALE * Math.min(width, height);
  const tangent = EYE_RADIUS / Math.sqrt(EYE_CAMERA_DISTANCE ** 2 - EYE_RADIUS ** 2);
  const fieldOfView = 2 * Math.atan(tangent * height / diameter);
  eyeCamera.perspective(fieldOfView, width / height, 20, 1600);
}

function aimEye(event, canvas) {
  if (event.pointerType === 'touch') return;
  const bounds = canvas.getBoundingClientRect();
  const x = 2 * (event.clientX - bounds.left) / bounds.width - 1;
  const y = 2 * (event.clientY - bounds.top) / bounds.height - 1;
  targetYaw = radians(MAX_ROTATION_Y) * constrain(x, -1, 1);
  targetPitch = -radians(MAX_ROTATION_X) * constrain(y, -1, 1);
}

function resetGaze() {
  targetPitch = 0;
  targetYaw = 0;
}

function pupilFresnel() {
  cameraInputs.begin();

  const surfaceNormal = normalize(cameraInputs.normal);
  const viewDirection = normalize(-cameraInputs.position);
  const base = 1.0 - dot(surfaceNormal, viewDirection);
  const fresnel = clamp(4.0 * pow(base, 2.0) - 0.1, 0.0, 1.0);

  const pink = mix([0.0, 0.0, 0.0], [1.0, 0.5, 0.7], fresnel);
  cameraInputs.color = [pink, 1.0];

  cameraInputs.end();
}

function drawEye() {
  const response = 1 - Math.exp(-ROTATION_SMOOTHNESS * Math.min(deltaTime, 100) / 1000);
  gazePitch = lerp(gazePitch, targetPitch, response);
  gazeYaw = lerp(gazeYaw, targetYaw, response);
  noStroke();

  push();
  setCamera(eyeCamera);
  rotateY(gazeYaw);
  rotateX(gazePitch);
  rotateY(EYE_FORWARD_ANGLE);

  push();
  shader(heatShader);
  heatShader.setUniform('uSeed', heatSeed);
  heatShader.setUniform('uTime', (millis() - heatStartedAt) / 1000);
  heatShader.setUniform('uFlowSpeed', HEATMAP_FLOW_SPEED);
  heatShader.setUniform('uDeformationSpeed', HEATMAP_DEFORMATION_SPEED);
  heatShader.setUniform('uMergeStrength', HEATMAP_MERGE_STRENGTH);
  heatShader.setUniform('uPatternScale', HEATMAP_PATTERN_SCALE);
  heatShader.setUniform('uNoiseStrength', HEATMAP_NOISE_STRENGTH);
  scale(2);
  model(eyeModel);
  pop();

  // Fresnel effect (assisted with AI)
  // The original Fresnel shaders follow the tracked eye's pivot.
  push();
  translate(-PUPIL_DEPTH * Math.tan(EYE_FORWARD_ANGLE), 0, PUPIL_DEPTH);
  shader(pupilShader);
  sphere(PUPIL_RADIUS, 64, 48);
  pop();

  if (corneaShader) {
    push();
    shader(corneaShader);
    corneaShader.setUniform('uOpacity', 0.90);
    corneaShader.setUniform('uFresnelPower', 1.0);
    corneaShader.setUniform('uFresnelColor', [1.0, 0.31, 0.64]);
    scale(2.05);
    model(corneaModel);
    pop();
  }
  pop();
}

function fractalBufferSize() {
  return [
    Math.max(1, Math.round(width * BACKGROUND_RESOLUTION)),
    Math.max(1, Math.round(height * BACKGROUND_RESOLUTION))
  ];
}

// Generative fractal background (assisted with AI)
function drawFractalBackground() {
  const seconds = (millis() - fractalStartedAt) / 1000;
  const motion = sampleFractalMotion(fractalMotion, seconds);
  const frontScale = Math.min(1, Math.min(width, height) / 480);

  fractalBuffer.begin();
  shader(fractalShader);
  noStroke();
  fractalShader.setUniform('uResolution', [fractalBuffer.width, fractalBuffer.height]);
  fractalShader.setUniform('uTime', (seconds * FRACTAL_SPEED) % (200 * Math.PI));
  fractalShader.setUniform('uSeed', motion.seed);
  fractalShader.setUniform('uCenter', motion.center);
  fractalShader.setUniform('uZoom', motion.zoom);
  fractalShader.setUniform('uAngle', motion.angle);
  fractalShader.setUniform('uExpansion', motion.expansion);
  fractalShader.setUniform('uMacroWeight', motion.macroWeight);
  fractalShader.setUniform('uDepthWeight', motion.depthWeight);
  fractalShader.setUniform('uBranchWeight', motion.branchWeight);
  fractalShader.setUniform('uDepthPhase', motion.depthPhase);
  fractalShader.setUniform('uDepthSeeds', motion.depthSeeds);
  fractalShader.setUniform('uDepthCenterX', motion.depthCenterX);
  fractalShader.setUniform('uDepthCenterY', motion.depthCenterY);
  fractalShader.setUniform('uOriginRadius', constrain(238 * frontScale / height, 0.20, 0.43));
  fractalShader.setUniform('uColorPhase', motion.colorPhase);
  fractalShader.setUniform('uMaxIterations', constrain(Math.round(MAX_ITERATIONS), 1, 192));
  fractalShader.setUniform('uColorIntensity', COLOR_INTENSITY);
  fractalShader.setUniform('uBrightness', BACKGROUND_BRIGHTNESS);
  fractalShader.setUniform('uContrast', BACKGROUND_CONTRAST);
  plane(1, 1);
  fractalBuffer.end();

  push();
  setCamera(fractalCamera);
  resetMatrix();
  imageMode(CORNER);
  noTint();
  image(fractalBuffer, -width / 2, -height / 2, width, height);
  pop();
  clearDepth(); // Keep the background quad from occluding the eye.
}

// Mandelbrot regions for the opening view and recursive close-ups.
const FRACTAL_REGIONS = [
  [-0.743643887, 0.131825904, 145],
  [-0.703, 0.285, 92],
  [-0.76, 0.112, 80],
  [-0.718, 0.215, 85]
];

const FRACTAL_DETAIL_REGIONS = [
  [-0.746774322, 0.134956339],
  [-0.733013043, 0.213130435],
  [-0.708478261, 0.288913043],
  [-0.202695652, 0.653434783],
  [-0.234342391, 0.826432391],
  [-0.722695652, 0.216565217],
  [-1.401937609, 0],
  [0.368782609, 0.119217391],
  [-0.213478261, 0.654521739],
  [-0.747648826, 0.115156826],
  [-0.777347826, 0.129521739],
  [0.432347826, 0.229]
];

function createFractalMotion() {
  const seed = Math.random();
  const [x, y, zoom] = FRACTAL_REGIONS[Math.floor(fractalRandom(seed, 0, 1) * FRACTAL_REGIONS.length)];
  const mirror = fractalRandom(seed, 0, 2) < 0.5 ? -1 : 1;
  const span = 3.6 / zoom;
  return {
    seed,
    start: [-0.53 + (Math.random() - 0.5) * 0.18, (Math.random() - 0.5) * 0.16],
    startZoom: 0.92 + Math.random() * 0.22,
    target: [
      x + span * 0.18 * (fractalRandom(seed, 0, 3) - 0.5),
      y * mirror + span * 0.18 * (fractalRandom(seed, 0, 4) - 0.5)
    ],
    targetZoom: zoom * Math.exp(0.32 * (fractalRandom(seed, 0, 5) - 0.5)),
    firstDiveSeconds: 92 + Math.random() * 24,
    angle: (Math.random() - 0.5) * 0.48,
    palette: Math.random()
  };
}

function fractalRandom(seed, level, channel) {
  const value = Math.sin(seed * 947.613 + level * 127.147 + channel * 79.317) * 43758.5453;
  return value - Math.floor(value);
}

function fractalEase(value) {
  const t = Math.max(0, Math.min(value, 1));
  return t * t * t * (10 + t * (-15 + 6 * t));
}

// Infinite zoom (assisted with AI)
function sampleFractalMotion(motion, seconds) {
  const time = Math.max(0, seconds * FRACTAL_SPEED);
  const cameraTime = time * Math.max(0, ZOOM_SPEED);
  const phase = motion.seed * Math.PI * 2;
  const progress = cameraTime / motion.firstDiveSeconds;
  const advance = fractalEase(progress / 0.72);
  const x = lerp(motion.start[0], motion.target[0], advance);
  const y = lerp(motion.start[1], motion.target[1], advance);
  const zoom = Math.exp(lerp(
    Math.log(motion.startZoom),
    Math.log(motion.targetZoom),
    fractalEase(progress)
  ));
  const drift = 0.052 / zoom;
  const palette = motion.palette + time * COLOR_SPEED + 0.035 * Math.sin(time * 0.019 + phase);

  // Send a fractional depth and three seeded levels to the shader.
  const linearDepth = cameraTime * DEPTH_ZOOM_RATE;
  const depth = 0.45 * motion.seed + linearDepth
    + 0.16 * (Math.sin(0.89 * linearDepth + phase) - Math.sin(phase))
    + 0.10 * Math.sin(1.41 * linearDepth);
  const level = Math.floor(depth);
  const levels = [level - 1, level, level + 1];
  const depthSeeds = [];
  const depthCenterX = [];
  const depthCenterY = [];

  for (const index of levels) {
    const seed = fractalRandom(motion.seed, index, 8);
    const region = Math.abs(index % 2) + 2 * Math.floor(seed * FRACTAL_DETAIL_REGIONS.length / 2);
    const [real, imaginary] = FRACTAL_DETAIL_REGIONS[region];
    const mirror = fractalRandom(motion.seed, index, 9) < 0.5 ? -1 : 1;
    depthSeeds.push(seed);
    depthCenterX.push(real + 0.0022 * (seed - 0.5));
    depthCenterY.push(imaginary * mirror + 0.0014 * (fractalRandom(motion.seed, index, 10) - 0.5));
  }

  return {
    center: [
      x + drift * (Math.sin(time * 0.034 + phase) + 0.38 * Math.sin(time * 0.081)),
      y + drift * (Math.cos(time * 0.027 + phase) + 0.38 * Math.sin(time * 0.065))
    ],
    zoom,
    angle: motion.angle + 0.22 * Math.sin(time * 0.018 + phase) + 0.09 * Math.sin(time * 0.043),
    expansion: fractalEase(time * EXPANSION_SPEED),
    seed: motion.seed,
    colorPhase: palette - Math.floor(palette),
    macroWeight: 1 - fractalEase((progress - 0.58) / 0.97),
    depthWeight: 0.30 + 0.70 * fractalEase(progress / 1.35),
    branchWeight: fractalEase((progress - 0.5) / 0.85),
    depthPhase: depth - level,
    depthSeeds,
    depthCenterX,
    depthCenterY
  };
}
