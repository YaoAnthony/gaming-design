// ===== 木手的卡通材质：明暗分成几档，每档直接用调色板里的一个颜色（和 Blender 里 Shader to RGB → 常量 ColorRamp 一样）=====
// 明暗 = (法线·光 + 环境光) × 遮蔽（烤在顶点色里，取几次方压暗凹槽）。颜色按 sRGB 原样输出，不抗锯齿：画出来的每个像素都是调色板里的颜色。
import * as THREE from 'three';

/** 从亮到暗的几档颜色（#rrggbb）；stops[i] = 第 i 档的明暗下限（长度 = 颜色数 - 1） */
export interface ToonPalette { colors: string[]; stops: number[] }
/** 主光的方向（相机坐标：x 右、y 上、z 朝镜头）、环境光、遮蔽取几次方 */
export interface ToonLight { dir: [number, number, number]; ambient: number; aoPower: number }

/** 最多几档 */
const BANDS = 5;

const VERT = /* glsl */ `
varying vec3 vNormal;
varying float vAo;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vAo = color.r;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 lightDir;
uniform float ambient;
uniform float aoPower;
uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform vec3 c3; uniform vec3 c4;
uniform vec4 stops;
varying vec3 vNormal;
varying float vAo;
void main() {
  float lit = max(dot(normalize(vNormal), normalize(lightDir)), 0.0);
  float v = (lit + ambient) * pow(max(vAo, 0.0), aoPower);
  vec3 c = c4;
  if (v >= stops.w) c = c3;
  if (v >= stops.z) c = c2;
  if (v >= stops.y) c = c1;
  if (v >= stops.x) c = c0;
  gl_FragColor = vec4(c, 1.0);
}`;

/** #rrggbb → 0..1 的分量（原样，不做色彩空间转换） */
const rgb = (hex: string): THREE.Vector3 => new THREE.Vector3(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);

export class ToonPaletteMaterial extends THREE.ShaderMaterial {
  constructor(palette: ToonPalette) {
    super({
      vertexShader: VERT, fragmentShader: FRAG, vertexColors: true,
      uniforms: {
        lightDir: { value: new THREE.Vector3(0, 0, 1) }, ambient: { value: 0 }, aoPower: { value: 1 },
        stops: { value: new THREE.Vector4() },
        ...Object.fromEntries(Array.from({ length: BANDS }, (_, i) => [`c${i}`, { value: new THREE.Vector3() }])),
      },
    });
    this.setPalette(palette);
  }

  /** 颜色少于 5 档时，多出来的档都用最暗的那个，门槛设成 0（永远过） */
  setPalette(p: ToonPalette): void {
    const n = Math.max(1, Math.min(BANDS, p.colors.length));
    for (let i = 0; i < BANDS; i++) (this.uniforms[`c${i}`].value as THREE.Vector3).copy(rgb(p.colors[Math.min(i, n - 1)]));
    const s = Array.from({ length: BANDS - 1 }, (_, i) => (i < n - 1 ? p.stops[i] ?? 0 : 0));
    (this.uniforms.stops.value as THREE.Vector4).set(s[0], s[1], s[2], s[3]);
  }

  setLight(l: ToonLight): void {
    (this.uniforms.lightDir.value as THREE.Vector3).set(l.dir[0], l.dir[1], l.dir[2]);
    this.uniforms.ambient.value = l.ambient;
    this.uniforms.aoPower.value = l.aoPower;
  }
}
