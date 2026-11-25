precision highp float;

attribute vec3 aPosition;

void main() {
  // Map p5's unit plane directly to clip space, independent of the eye camera.
  gl_Position = vec4(aPosition.xy * 2.0, 0.0, 1.0);
}
