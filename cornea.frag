precision highp float;

varying vec3 vNormal;
varying vec3 vViewPosition;

uniform float uOpacity;
uniform float uFresnelPower;
uniform vec3 uFresnelColor;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(-vViewPosition);

  // Grazing angles tint the cornea and increase its opacity toward the rim.
  float facing = abs(dot(normal, viewDir));
  float fresnel = pow(1.0 - facing, uFresnelPower);

  vec3 centerColor = vec3(0.05, 0.30, 0.35);
  vec3 edgeColor = uFresnelColor;
  vec3 color = mix(centerColor, edgeColor, fresnel);
  float alpha = mix(0.01, uOpacity, fresnel);

  gl_FragColor = vec4(color, alpha);
}
