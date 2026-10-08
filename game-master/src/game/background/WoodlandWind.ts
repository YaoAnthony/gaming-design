import Phaser from 'phaser';

const KEY = 'WoodlandWind';
// Pin all four room edges. Only the near foliage texture is sampled differently;
// the far plate, midplane, image rectangle and crop stay fixed.
export const WOODLAND_WIND_FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uMainSampler;
uniform float uTime;
uniform float uPhase;
uniform float uStrength;
uniform float uCloud;
uniform vec2 uRoomSize;
varying vec2 outTexCoord;
varying float outTintEffect;
varying vec4 outTint;
void main() {
    vec2 uv = outTexCoord;
    vec4 original = texture2D(uMainSampler, uv);
    vec3 rgb = original.rgb / max(original.a, 0.001);
    float green = smoothstep(0.002, 0.025, rgb.g - rgb.r);
    float darkLeaf = (1.0 - smoothstep(0.12, 0.18, max(rgb.r, rgb.g)))
        * (1.0 - smoothstep(0.012, 0.032, rgb.b - rgb.g));
    float wood = smoothstep(0.012, 0.045, rgb.r - rgb.g);
    float foliage = max(green, darkLeaf) * (1.0 - wood);
    float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    float pinned = smoothstep(0.0, 0.065, edge);
    float wave = 0.72 * sin(uTime * 1.05 + uv.x * 10.0 + uv.y * 3.0 + uPhase)
        + 0.28 * sin(uTime * 0.63 + uv.x * 21.0 - uv.y * 6.0 + uPhase * 1.7);
    vec2 bend = vec2(1.7 * wave, 0.32 * sin(uTime * 0.83 + uv.x * 13.0 + uPhase));
    if (uCloud > 0.5) {
        bend = vec2(22.0 * sin(uTime * 0.18), 0.8 * sin(uTime * 0.08));
        foliage = 1.0;
    }
    uv += bend / uRoomSize * foliage * pinned * uStrength;
    vec4 sampleColor = texture2D(uMainSampler, uv);
    vec4 tint = vec4(outTint.bgr * outTint.a, outTint.a);
    vec4 color = sampleColor * tint;
    if (outTintEffect == 1.0) color.rgb = mix(sampleColor.rgb, outTint.bgr * outTint.a, sampleColor.a);
    else if (outTintEffect == 2.0) color = tint;
    gl_FragColor = color;
}
`;

export interface WindData { cloud?: boolean; time: number; phase: number; strength: number; w: number; h: number }

class WindPipeline extends Phaser.Renderer.WebGL.Pipelines.SinglePipeline {
  constructor(game: Phaser.Game) { super({ game, fragShader: WOODLAND_WIND_FRAGMENT }); }
  onBind(object?: Phaser.GameObjects.GameObject): void {
    if (!object) return;
    const data = (object as Phaser.GameObjects.Image).pipelineData as WindData;
    // Adjacent rooms use different phases; flush before changing per-image uniforms.
    this.flush();
    this.set1f('uTime', data.time);
    this.set1f('uPhase', data.phase);
    this.set1f('uStrength', data.strength);
    this.set1f('uCloud', data.cloud ? 1 : 0);
    this.set2f('uRoomSize', data.w, data.h);
  }
}

export function attachWoodlandWind(image: Phaser.GameObjects.Image, data: WindData): boolean {
  const renderer = image.scene.game.renderer;
  if (renderer.type !== Phaser.WEBGL) return false;
  const pipelines = (renderer as Phaser.Renderer.WebGL.WebGLRenderer).pipelines;
  if (!pipelines.has(KEY)) pipelines.add(KEY, new WindPipeline(image.scene.game));
  image.setPipeline(KEY, data, false);
  return true;
}
