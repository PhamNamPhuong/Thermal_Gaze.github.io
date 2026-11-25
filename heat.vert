precision highp float;

attribute vec3 aPosition;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform vec3 uSeed;
uniform float uTime;
uniform float uFlowSpeed;
uniform float uDeformationSpeed;

varying vec3 vPosition;
varying vec4 vHeatLobeA;
varying vec4 vHeatLobeB;

void main() {
  // Keep the heat field attached to the eye as it rotates.
  vPosition = aPosition;

  // Calculate lobe motion at vertex rate. The fragment shader blends the field.
  float flow = uTime * uFlowSpeed;
  float deformation = uTime * uDeformationSpeed;
  vec3 phase = uSeed * vec3(0.29, 0.35, 0.41);
  vec3 center = vec3(1.5, 1.4, 1.13) * sin(vec3(0.16, 0.127, 0.113) * flow + phase);
  center.z += 1.15;

  float turn = 0.19 * flow + phase.y;
  vec3 axis = vec3(cos(turn), sin(turn), 0.34 * sin(0.131 * flow + phase.z));
  float separation = 0.98 + 0.62 * sin(0.29 * flow + phase.x);
  vec3 offset = axis * separation;
  float radiusA = 2.35 + 0.27 * sin(0.21 * deformation + phase.z);
  float radiusB = 2.26 + 0.29 * cos(0.163 * deformation + phase.x);
  vHeatLobeA = vec4(center + offset, 1.0 / (radiusA * radiusA));
  vHeatLobeB = vec4(center - offset, 1.0 / (radiusB * radiusB));

  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
}
