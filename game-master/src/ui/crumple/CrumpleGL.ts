// ===== 攥纸团的画法：一个自己的 WebGL 画布，把 CrumpleMesh 算好的三角形贴上冻住的游戏画面画出来 =====
// 冻住之前画布是透明的（底下的游戏照常显示），冻住之后才铺上背景、画纸。
// 开深度测试（纸叠起来时近的挡住远的）；纸翻过去的面、褶缝里墨裂开的地方画成白纸（米白色，隐约透出一点画面）。
import { VERTEX_FLOATS } from './crumpleMesh';

const VS = `
attribute vec3 aPos;
attribute vec2 aUv;
attribute vec2 aShade;
uniform vec2 uSize;
uniform float uDepth;
varying vec2 vUv;
varying vec2 vShade;
void main() {
  vUv = aUv;
  vShade = aShade;
  gl_Position = vec4(aPos.x / uSize.x * 2.0 - 1.0, 1.0 - aPos.y / uSize.y * 2.0, -aPos.z / uDepth, 1.0);
}`;

const FS = `
precision mediump float;
uniform sampler2D uTex;
uniform vec3 uPaper;
varying vec2 vUv;
varying vec2 vShade;
void main() {
  vec3 front = texture2D(uTex, vUv).rgb;
  vec3 back = mix(uPaper, front, 0.12);
  gl_FragColor = vec4(mix(back, front, vShade.y) * vShade.x, 1.0);
}`;

/** 纸背面的颜色、背景色（和页面底色一样） */
const PAPER = [0.94, 0.91, 0.85];
const BG = [11 / 255, 11 / 255, 20 / 255];

export class CrumpleGL {
  private readonly gl: WebGLRenderingContext;
  private readonly prog: WebGLProgram;
  private readonly buf: WebGLBuffer;
  private readonly tex: WebGLTexture;
  private readonly uSize: WebGLUniformLocation | null;
  private readonly uDepth: WebGLUniformLocation | null;
  private smooth = false;
  private hasImage = false;

  /**
   * @param w,h 画布的 CSS 像素大小（顶点坐标就用它）
   * @param depth z 的范围（像素）：顶点的 z 要在 ±depth 以内
   */
  constructor(canvas: HTMLCanvasElement, private w: number, private h: number, dpr: number, private depth: number) {
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, depth: true, premultipliedAlpha: true });
    if (!gl) throw new Error('WebGL 不可用');
    this.gl = gl;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);

    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'program');
    gl.useProgram(prog);
    this.prog = prog;

    this.buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    const stride = VERTEX_FLOATS * 4;
    const attr = (name: string, size: number, offset: number) => {
      const loc = gl.getAttribLocation(prog, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset * 4);
    };
    attr('aPos', 3, 0); attr('aUv', 2, 3); attr('aShade', 2, 5);

    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.setFilter(false);

    this.uSize = gl.getUniformLocation(prog, 'uSize');
    this.uDepth = gl.getUniformLocation(prog, 'uDepth');
    gl.uniform3f(gl.getUniformLocation(prog, 'uPaper'), PAPER[0], PAPER[1], PAPER[2]);
    gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
  }

  /** 换上冻住那一帧的画面（纸正面的图） */
  setImage(image: TexImageSource): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    this.hasImage = true;
  }

  /** 平放时按像素画（和游戏画面一模一样），皱起来之后平滑采样（缩小了不闪） */
  private setFilter(smooth: boolean): void {
    const gl = this.gl, f = smooth ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    this.smooth = smooth;
  }

  /** 画一帧。mode：'none' = 透明（还没冻住，底下的游戏照常显示）；'empty' = 纸拿走了，只剩背景；'paper' = 画纸 */
  draw(verts: Float32Array, count: number, smooth: boolean, mode: 'none' | 'empty' | 'paper'): void {
    const gl = this.gl;
    if (mode === 'none') gl.clearColor(0, 0, 0, 0); else gl.clearColor(BG[0], BG[1], BG[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (mode !== 'paper' || !this.hasImage) return;
    if (smooth !== this.smooth) this.setFilter(smooth);
    gl.uniform2f(this.uSize, this.w, this.h);
    gl.uniform1f(this.uDepth, this.depth);
    gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, count * VERTEX_FLOATS), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, count);
  }

  /** 释放 GPU 资源。不丢弃上下文：StrictMode 下同一个画布还会再建一次 */
  destroy(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.buf); gl.deleteTexture(this.tex); gl.deleteProgram(this.prog);
  }
}
