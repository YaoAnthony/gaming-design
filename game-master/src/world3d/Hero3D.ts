// ===== 3D 世界里的主角：一张永远朝着镜头的贴图（和 2D 里是同一张），脚下一团影子 =====
import * as THREE from 'three';

/** 影子：比身宽大多少倍、多黑 */
const SHADOW = { scale: 1.3, opacity: 0.4 };
/** 影子比地面高一点点，免得和地面抢着画 */
const SHADOW_LIFT = 0.02;

export class Hero3D {
  readonly object = new THREE.Group();
  private readonly sprite: THREE.Sprite;
  private readonly shadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private readonly texture: THREE.Texture;

  /** @param w,h 人的宽高（格） */
  constructor(url: string, private readonly w: number, private readonly h: number) {
    this.texture = new THREE.TextureLoader().load(url);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.wrapS = THREE.RepeatWrapping;   // 朝左时把贴图左右翻过来
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, transparent: true }));
    this.sprite.center.set(0.5, 0);   // 锚点在脚底
    this.sprite.scale.set(w, h, 1);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: SHADOW.opacity, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.setScalar(w * SHADOW.scale);
    this.object.add(this.sprite, this.shadow);
  }

  /** 人放在哪（脚底中心）、整个人缩放多少（走回画面时用） */
  place(x: number, y: number, z: number, scale = 1): void {
    this.sprite.position.set(x, y, z);
    this.sprite.scale.set(this.w * scale, this.h * scale, 1);
  }

  face(dir: 1 | -1): void {
    this.texture.repeat.x = dir;
    this.texture.offset.x = dir < 0 ? 1 : 0;
  }

  /** 影子落在人正下方的地面上；groundY = null（脚下是空的）就不画 */
  castShadow(groundY: number | null): void {
    this.shadow.visible = groundY !== null;
    if (groundY !== null) this.shadow.position.set(this.sprite.position.x, groundY + SHADOW_LIFT, this.sprite.position.z);
  }

  dispose(): void {
    this.texture.dispose();
    this.sprite.material.dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
  }
}
