// ===== 受场景灯光照的卡通材质：three 自带的 MeshToonMaterial + 三档的明暗分档贴图 =====
// 3D 世界里用它（聚光灯、阴影、雾都管用）；界面上的木手用的是按固定方向分档的 ToonPaletteMaterial。
// 顶点色里烤好的环境光遮蔽直接乘在颜色上（vertexColors）。
import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/** 四档：背光几乎全黑、暗、中、亮；最近邻采样，所以是硬边的色阶 */
function gradientMap(): THREE.DataTexture {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([22, 22, 22, 255, 80, 80, 80, 255, 150, 150, 150, 255, 255, 255, 255, 255]), 4, 1, THREE.RGBAFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

/** 调色板的中间那一档当基色（灯光再分出亮暗） */
export function toonLitMaterial(colors: string[], opts: { vertexAo?: boolean } = {}): THREE.MeshToonMaterial {
  const hex = colors[Math.min(1, colors.length - 1)];
  return new THREE.MeshToonMaterial({ color: new THREE.Color(hex), gradientMap: gradientMap(), vertexColors: opts.vertexAo ?? true });
}
