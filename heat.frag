// Heatmap shader (assisted with AI)
// The liquid motion layers drifting noise with two overlapping heat lobes.
precision highp float;

uniform vec3 uSeed;
uniform float uTime;
uniform float uFlowSpeed;
uniform float uDeformationSpeed;
uniform float uMergeStrength;
uniform float uPatternScale;
uniform float uNoiseStrength;

varying vec3 vPosition;
varying vec4 vHeatLobeA;
varying vec4 vHeatLobeB;

vec3 rgb(float r, float g, float b) {
  return vec3(r, g, b) / 255.0;
}

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.17, 0.39, 0.53));
  p *= 17.0;

  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// Interpolate the hashed corners of the 3D lattice.
float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);

  f = f * f * (3.0 - 2.0 * f);

  float bottom = mix(
    mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
    mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x),
    f.y
  );

  float top = mix(
    mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
    mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x),
    f.y
  );

  return mix(bottom, top, f.z);
}

// Narrow transitions soften the edges between distinct thermal bands.
vec3 heatPalette(float heat) {
  vec3 color = rgb(18.0, 142.0, 174.0);

  color = mix(color, rgb(17.0, 169.0, 145.0),
    smoothstep(0.155, 0.165, heat));

  color = mix(color, rgb(57.0, 167.0, 96.0),
    smoothstep(0.265, 0.275, heat));

  color = mix(color, rgb(169.0, 200.0, 74.0),
    smoothstep(0.355, 0.365, heat));

  color = mix(color, rgb(243.0, 222.0, 57.0),
    smoothstep(0.455, 0.465, heat));

  color = mix(color, rgb(244.0, 148.0, 40.0),
    smoothstep(0.555, 0.565, heat));

  color = mix(color, rgb(241.0, 91.0, 53.0),
    smoothstep(0.645, 0.655, heat));

  color = mix(color, rgb(230.0, 40.0, 57.0),
    smoothstep(0.735, 0.745, heat));

  return mix(color, rgb(227.0, 14.0, 104.0),
    smoothstep(0.845, 0.855, heat));
}

float heatLobe(vec3 p, vec4 lobe) {
  // Compact support gives each lobe a soft edge and no contribution far away.
  vec3 offset = p - lobe.xyz;
  float influence = max(0.0, 1.0 - dot(offset, offset) * lobe.w);
  return influence * influence;
}

void main() {
  vec3 domain = vPosition * uPatternScale;
  vec3 p = domain + uSeed;
  float flow = uTime * uFlowSpeed;
  float deformation = uTime * uDeformationSpeed;

  // Coarse heat and smaller eddies move through separate, slowly warping
  // domains. Their different velocities stretch the contours over time.
  float warp = noise3(p * 0.77 + 8.1 + deformation * vec3(0.055, 0.028, -0.041));
  vec3 bend = 0.30 * sin(
    domain.yzx * vec3(0.36, 0.41, 0.32) +
    uSeed * 0.17 + deformation * vec3(0.071, -0.053, 0.064)
  );
  vec3 displacement = vec3(warp, -warp, warp) * 1.35 + bend;
  float broad = noise3(p + displacement + flow * vec3(0.070, -0.036, 0.049));
  float detail = noise3(
    p * 2.07 + 12.4 - 0.52 * displacement + flow * vec3(-0.096, 0.052, 0.081)
  );
  float heat = (mix(broad, detail, clamp(uNoiseStrength, 0.0, 1.0)) - 0.5) * 1.80 + 0.53;

  // The sum raises the saddle between lobes, where a contour can connect.
  vec3 lobesPoint = domain + bend;
  float overlap = heatLobe(lobesPoint, vHeatLobeA) + 0.88 * heatLobe(lobesPoint, vHeatLobeB);
  heat += uMergeStrength * (overlap - 0.13);

  // Apply a fine object-space grain before mapping heat to color.
  float grain = hash(floor(vPosition * 5.0) + uSeed) - 0.5;
  gl_FragColor = vec4(heatPalette(heat + 0.023 * grain), 1.0);
}
