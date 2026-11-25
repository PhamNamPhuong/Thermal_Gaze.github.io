// Generative fractal background (assisted with AI)
//
// The mathematical reference is p5.js Mandelbrot Set, based on Dan Shiffman's
// Processing example, revised by Darren Kessner, and maintained by p5.js
// Contributors and the Processing Foundation. The example is CC BY-NC-SA 4.0.
// https://p5js.org/examples/Math-And-Physics-Mandelbrot/
// https://creativecommons.org/licenses/by-nc-sa/4.0/
//
// This shader adds smooth coloring, distance estimation and animated sampling.
precision highp float;

uniform vec2 uResolution;      // Framebuffer dimensions in pixels
uniform vec2 uCenter;          // Real and imaginary center of the view
uniform float uZoom;           // Inverse of the visible complex-plane span
uniform float uAngle;          // Rotation of the sampling plane in radians
uniform float uTime;           // Wrapped animation time in seconds
uniform float uSeed;           // Per-reload variation for the palette and glow
uniform float uExpansion;      // Progress of the first outward heat front
uniform float uOriginRadius;   // Starting radius as a fraction of canvas height
uniform float uColorPhase;     // Slow palette offset in cycles
uniform float uMacroWeight;    // Visibility of the original Mandelbrot opening
uniform float uDepthWeight;    // Visibility of the nested field as it develops
uniform float uBranchWeight;   // Visibility of the recursive boundary close-ups
uniform float uDepthPhase;     // Fractional progress through the current zoom scale
uniform vec3 uDepthSeeds;      // Seeds for the departing, current and arriving scales
uniform vec3 uDepthCenterX;    // Real components of the three boundary centers
uniform vec3 uDepthCenterY;    // Imaginary components of the three boundary centers
uniform float uColorIntensity; // Saturation of the generated colors
uniform float uBrightness;     // Overall exposure of the background
uniform float uContrast;       // Contrast between the glow and the dark field
uniform int uMaxIterations;

const int ITERATION_LIMIT = 192;

vec2 complexProduct(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

int mainBulb(vec2 c) {
  // The main cardioid and period-two bulb are inside the set by definition.
  // Skipping them saves most of the iteration work during wider views.
  vec2 p = c - vec2(0.25, 0.0);
  float q = dot(p, p);
  if (q * (q + p.x) <= 0.25 * c.y * c.y) return 1;
  p = c + vec2(1.0, 0.0);
  if (dot(p, p) <= 0.0625) return 2;
  return 0;
}

vec3 thermalPalette(float phase) {
  float t = fract(phase);
  vec3 purple = vec3(0.28, 0.035, 0.49);
  vec3 blue = vec3(0.10, 0.21, 0.89);
  vec3 cyan = vec3(0.03, 0.76, 0.90);
  vec3 green = vec3(0.31, 0.77, 0.23);
  vec3 yellow = vec3(0.97, 0.79, 0.18);
  vec3 orange = vec3(1.0, 0.35, 0.06);
  vec3 red = vec3(0.92, 0.065, 0.15);
  vec3 magenta = vec3(0.83, 0.095, 0.64);

  if (t < 0.14) return mix(purple, blue, smoothstep(0.00, 0.14, t));
  if (t < 0.28) return mix(blue, cyan, smoothstep(0.14, 0.28, t));
  if (t < 0.38) return mix(cyan, green, smoothstep(0.28, 0.38, t));
  if (t < 0.49) return mix(green, yellow, smoothstep(0.38, 0.49, t));
  if (t < 0.61) return mix(yellow, orange, smoothstep(0.49, 0.61, t));
  if (t < 0.73) return mix(orange, red, smoothstep(0.61, 0.73, t));
  if (t < 0.86) return mix(red, magenta, smoothstep(0.73, 0.86, t));
  return mix(magenta, purple, smoothstep(0.86, 1.0, t));
}

vec3 bulbGlow(vec2 c, int bulb, float palettePhase) {
  // Inside the large bulbs, color the derivative of the attracting cycle.
  // Their multiplier runs from zero at the center to unit length at the rim.
  vec2 multiplier = 4.0 * (c + vec2(1.0, 0.0));
  if (bulb == 1) {
    vec2 discriminant = vec2(1.0, 0.0) - 4.0 * c;
    vec2 root = sqrt(max(
      vec2(0.0),
      0.5 * (length(discriminant) + vec2(discriminant.x, -discriminant.x))
    ));
    multiplier = vec2(1.0, 0.0) - root * vec2(1.0, sign(discriminant.y));
  }
  float strength = length(multiplier);
  float phase = palettePhase + 0.18 * multiplier.y + 0.22 * strength + 0.18 * float(bulb);
  float pulse = 0.82 + 0.18 * cos(13.0 * strength - 4.0 * multiplier.y);
  float falloff = 1.0 - smoothstep(0.37, 1.0, strength);
  return thermalPalette(phase) * pulse * falloff * 0.17;
}

vec3 mandelbrotHeat(vec2 c, float span, float palettePhase, int limit) {
  int bulb = mainBulb(c);
  if (bulb > 0) return bulbGlow(c, bulb, palettePhase);

  vec2 z = vec2(0.0);
  vec2 derivative = vec2(0.0);
  float magnitudeSquared = 0.0;
  float orbitDistance = 10.0;
  int escapedAt = 0;

  for (int i = 0; i < ITERATION_LIMIT; i++) {
    if (i >= limit) break;
    // The Mandelbrot recurrence starts at z(0) = 0 and uses z(n+1) = z(n)^2 + c.
    // Its derivative estimates the distance to the boundaries of the branches.
    derivative = clamp(
      2.0 * complexProduct(z, derivative) + vec2(1.0, 0.0),
      vec2(-1.0e15),
      vec2(1.0e15)
    );
    z = complexProduct(z, z) + c;
    magnitudeSquared = dot(z, z);
    orbitDistance = min(orbitDistance, abs(z.x + 0.25 * z.y));
    if (magnitudeSquared > 256.0) {
      escapedAt = i + 1;
      break;
    }
  }

  if (escapedAt == 0) {
    // Stable, bounded orbits leave a soft tint in the smaller bulbs.
    float stability = 1.0 / (1.0 + log2(1.0 + length(derivative)));
    vec3 tint = thermalPalette(palettePhase + 0.19 + 0.37 * exp2(-10.0 * orbitDistance));
    return tint * 0.095 * stability * stability;
  }

  float logMagnitude = 0.5 * log(magnitudeSquared);
  float iterations = max(0.0, float(escapedAt) + 1.0 - log2(logMagnitude));
  float distance = sqrt(magnitudeSquared) * logMagnitude / max(length(derivative), 0.0001);
  float distanceInView = distance / span;
  float pixelDistance = distanceInView * uResolution.y;
  float scale = log2(1.0 + iterations) * mix(0.153, 0.214, fract(7.13 * uSeed));
  float trapAccent = exp2(-15.0 * orbitDistance);
  vec3 heat = thermalPalette(scale + palettePhase + 0.13 * trapAccent);
  vec3 core = thermalPalette(scale + palettePhase + 0.17);

  // Fractional escape time colors broad mist, narrow glow and subpixel ridges.
  float mist = exp2(-5.0 * distanceInView);
  float glow = exp2(-31.0 * distanceInView);
  float filament = exp2(-2.9 * pixelDistance);
  float coarseEdge = exp2(-125.0 * distanceInView);
  float fade = 1.0 - smoothstep(float(limit) * 0.75, float(limit), float(escapedAt));
  return fade * (heat * (0.18 * mist + 0.28 * glow + 0.16 * coarseEdge)
    + core * (0.24 * filament + 0.10 * glow * trapAccent));
}

vec3 recursiveHeat(vec2 point, float age, float seed) {
  // Each seed owns a local coordinate system. Equal age always gives equal
  // sampling, even when a field moves to the next slot in the stack.
  float scale = 3.15 * exp2(-1.45 * age);
  vec2 p = point * scale;
  float turn = 6.2831853 * seed + uAngle + 0.48 * log(1.0 + dot(p, p));
  vec2 anchor = vec2(cos(turn), sin(turn));
  p = complexProduct(p, anchor);
  p += 0.19 * vec2(sin(1.6 * p.y + seed * 13.0), cos(1.8 * p.x - seed * 17.0));

  vec2 z = p + 0.28 * vec2(cos(21.0 * seed), sin(17.0 * seed));
  float tilt = mix(0.42, 0.94, seed);
  vec2 turnFold = vec2(cos(tilt), sin(tilt));
  vec2 foldOffset = vec2(mix(-0.35, 0.26, seed), mix(0.28, 0.64, seed));
  float trapRadius = mix(0.35, 0.67, fract(seed * 11.3));
  float pixel = scale / uResolution.y;
  float stretchSoFar = 1.0;
  float strength = 0.72;
  float veins = 0.0;
  float glow = 0.0;
  float heat = 0.0;

  for (int i = 0; i < 6; i++) {
    // The triangle fold is continuous at cell edges. Rotation, radial stretch
    // and the input feedback place smaller curves inside the larger ones.
    z = abs(mod(z + 1.0, 4.0) - 2.0) - 1.0;
    z *= 1.5 - 0.5 * z * z;
    float r2 = dot(z, z);
    float stretch = 1.54 + 0.41 / (0.42 + r2);
    z = complexProduct(z * stretch, turnFold) + foldOffset + 0.13 * p;
    stretchSoFar = stretchSoFar * stretch + 0.13;

    float shell = abs(dot(z, z * vec2(0.81, 1.19)) - trapRadius) / (0.7 + length(z));
    float branch = abs(z.x * z.y - 0.19) / (0.48 + abs(z.x) + abs(z.y));
    float distance = min(shell, branch * 1.32);
    float footprint = pixel * stretchSoFar;
    float visible = 1.0 - smoothstep(0.18, 0.67, footprint);
    float line = 1.0 - smoothstep(footprint * 0.45, 0.072 + footprint * 1.1, distance);
    float haze = exp2(-10.0 * distance);
    veins = max(veins, line * strength * visible);
    glow += haze * strength * visible;
    heat += (shell - branch) * haze * strength * visible;
    strength *= mix(0.70, 0.87, haze);
  }

  float phase = uColorPhase + seed * 0.68 + 0.36 * heat + 0.14 * glow;
  vec3 mist = thermalPalette(phase);
  vec3 filament = thermalPalette(phase + 0.19 + 0.10 * veins);
  return mist * (0.12 * glow) + filament * (0.28 * veins);
}

vec3 recursiveDepth(vec2 point, float radius) {
  vec3 veins = vec3(0.0);
  vec3 branches = vec3(0.0);
  float coverage = 0.0;
  float branchCoverage = 0.0;
  int branchLimit = uMaxIterations < 128 ? uMaxIterations : 128;
  for (int i = 0; i < 3; i++) {
    float age = uDepthPhase + 1.0 - float(i);
    // At a handoff ages 0 and 1 keep their seed, scale and weight. The two
    // ends of the window reach zero before a field enters or leaves it.
    float weight = smoothstep(-1.0, -0.30, age) * (1.0 - smoothstep(0.62, 2.0, age));
    if (weight > 0.0) {
      veins += weight * recursiveHeat(point, age, uDepthSeeds[i]);
      coverage += weight;
    }

    // Keep at most two expensive close-ups active, inside the wider vein
    // windows. The incoming boundary already expands before it becomes bright.
    float branchWeight = smoothstep(-0.46, 0.07, age) * (1.0 - smoothstep(0.65, 1.36, age));
    if (uBranchWeight > 0.0 && branchWeight > 0.0) {
      float seed = uDepthSeeds[i];
      float span = 0.020 * exp2(-1.45 * age);
      float angle = (seed - 0.5) * 2.2 + uAngle + 0.29 * radius;
      vec2 direction = vec2(cos(angle), sin(angle));
      vec2 center = vec2(uDepthCenterX[i], uDepthCenterY[i]);
      branches += branchWeight * mandelbrotHeat(
        center + span * complexProduct(point, direction),
        span,
        uColorPhase + 0.24 * seed,
        branchLimit
      );
      branchCoverage += branchWeight;
    }
  }

  vec3 canopy = branches * uBranchWeight / (0.60 + 0.54 * branchCoverage);
  float veil = 1.0 - 0.68 * clamp(max(canopy.r, max(canopy.g, canopy.b)), 0.0, 0.9);
  return canopy + veil * uDepthWeight * veins / (0.7 + 0.46 * coverage);
}

void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 screenPoint = (gl_FragCoord.xy / uResolution - 0.5) * vec2(aspect, 1.0);
  float span = 3.6 / uZoom;
  vec2 c = uCenter + span * complexProduct(screenPoint, vec2(cos(uAngle), sin(uAngle)));

  float radius = length(screenPoint);
  float outerRadius = 0.53 * length(vec2(aspect, 1.0)) + 0.05;
  float frontRadius = mix(uOriginRadius, max(uOriginRadius, outerRadius), uExpansion);
  // Skew the feathered heat front in several directions as its radius grows.
  float tide = 0.025 * sin(11.0 * screenPoint.x + 6.0 * screenPoint.y + 0.15 * uTime + uSeed)
    + 0.018 * sin(7.0 * screenPoint.y - 9.0 * screenPoint.x - 0.11 * uTime);
  float front = 1.0 - smoothstep(frontRadius - 0.10, frontRadius + 0.19, radius + tide);
  float halo = exp2(-4.0 * radius * radius);
  vec3 navy = vec3(0.018, 0.022, 0.058);
  vec3 plum = vec3(0.066, 0.025, 0.098);
  vec3 base = mix(navy, plum, 0.45 * halo + 0.12 * sin(uSeed + uTime * 0.04));
  vec3 color = base + front * vec3(0.028, 0.018, 0.055);

  float centerShade = mix(0.72, 1.0, smoothstep(0.1, 0.42, radius));
  if (front > 0.0) {
    color += front * centerShade * recursiveDepth(screenPoint, radius);
  }

  float macro = front * uMacroWeight;
  if (macro > 0.0) {
    color += macro * centerShade * mandelbrotHeat(c, span, uColorPhase, uMaxIterations);
  }

  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = max(vec3(0.0), mix(vec3(luminance), color, uColorIntensity));
  color = pow(color, vec3(uContrast)) * uBrightness;
  gl_FragColor = vec4(color, 1.0);
}
