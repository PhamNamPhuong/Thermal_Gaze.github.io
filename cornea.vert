precision highp float;

attribute vec3 aPosition;
attribute vec3 aNormal;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat3 uNormalMatrix;

varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  // The Fresnel calculation uses the position and normal in view space.
  vec4 viewPos = uModelViewMatrix * vec4(aPosition, 1.0);
  vViewPosition = viewPos.xyz;
  vNormal = normalize(uNormalMatrix * aNormal);

  gl_Position = uProjectionMatrix * viewPos;
}
