import Phaser from 'phaser';
import {
  PLAYER_ANIMS,
  ENEMY_KIND_SPRITES,
  ENEMY_PLACEHOLDER_COLORS,
  KENNEY_GROUND_KEY,
  KENNEY_GROUND_URL,
  KENNEY_BG_KEY,
  KENNEY_BG_URL,
  PROJECTILE_KEY,
  PROJECTILE_URL,
  type AnimSource,
} from '../assets/manifest';
import type { EnemyKind } from '../levels/level1';
import { registerAll } from '../rendering/AnimationRegistry';

/** 占位纹理约 96×128；真正 spritesheet 为 64×64 多帧时由 manifest 驱动。 */
const PLACEHOLDER_W = 96;
const PLACEHOLDER_H = 128;

/**
 * 预加载场景：按 manifest 拉纹理；失败则记 key 并生成占位图，不中断进对战。
 */
export default class PreloadScene extends Phaser.Scene {
  private readonly missingKeys = new Set<string>();

  constructor() {
    super({ key: 'PreloadScene', active: false });
  }

  preload(): void {
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      this.missingKeys.add(file.key);
    });

    this.queueAnims(PLAYER_ANIMS);
    for (const spec of Object.values(ENEMY_KIND_SPRITES)) {
      this.load.image(spec.key, spec.url);
      // Boss 的 P3 内核贴图（可选）
      if (spec.coreKey && spec.coreUrl) {
        this.load.image(spec.coreKey, spec.coreUrl);
      }
    }
    this.load.image(KENNEY_GROUND_KEY, KENNEY_GROUND_URL);
    this.load.image(KENNEY_BG_KEY, KENNEY_BG_URL);
    // 弹丸：只用 public 路径，不加载 generated/
    this.load.image(PROJECTILE_KEY, PROJECTILE_URL);
  }

  create(): void {
    for (const anim of PLAYER_ANIMS) {
      if (!this.textures.exists(anim.key) || this.missingKeys.has(anim.key)) {
        this.makePlayerPlaceholder(anim.key);
      }
    }
    for (const kind of Object.keys(ENEMY_KIND_SPRITES) as EnemyKind[]) {
      const spec = ENEMY_KIND_SPRITES[kind];
      if (!this.textures.exists(spec.key) || this.missingKeys.has(spec.key)) {
        this.makeEnemyPlaceholder(spec.key, ENEMY_PLACEHOLDER_COLORS[kind]);
      }
      // 内核缺图：黑底红字块占位
      if (
        spec.coreKey &&
        (!this.textures.exists(spec.coreKey) || this.missingKeys.has(spec.coreKey))
      ) {
        this.makeCorePlaceholder(spec.coreKey);
      }
    }

    if (!this.textures.exists(KENNEY_GROUND_KEY) || this.missingKeys.has(KENNEY_GROUND_KEY)) {
      this.makeSolidPlaceholder(KENNEY_GROUND_KEY, 0x6b7f9a, 32, 32);
    }
    if (!this.textures.exists(KENNEY_BG_KEY) || this.missingKeys.has(KENNEY_BG_KEY)) {
      this.makeSolidPlaceholder(KENNEY_BG_KEY, 0x24304a, 64, 64);
    }

    if (!this.textures.exists(PROJECTILE_KEY) || this.missingKeys.has(PROJECTILE_KEY)) {
      this.makeProjectilePlaceholder(PROJECTILE_KEY);
    }

    this.applyNearestFilter([
      ...PLAYER_ANIMS.map((a) => a.key),
      ...Object.values(ENEMY_KIND_SPRITES).flatMap((s) =>
        s.coreKey ? [s.key, s.coreKey] : [s.key],
      ),
      KENNEY_GROUND_KEY,
      KENNEY_BG_KEY,
      PROJECTILE_KEY,
    ]);

    registerAll(this);
    this.scene.start('GameScene');
  }

  private queueAnims(anims: readonly AnimSource[]): void {
    for (const anim of anims) {
      if (anim.placeholderOnly) {
        continue;
      }
      const useSheet =
        anim.frameWidth != null &&
        anim.frameHeight != null &&
        anim.frameCount > 1;

      if (useSheet) {
        this.load.spritesheet(anim.key, anim.url, {
          frameWidth: anim.frameWidth!,
          frameHeight: anim.frameHeight!,
        });
      } else {
        this.load.image(anim.key, anim.url);
      }
    }
  }

  private applyNearestFilter(keys: string[]): void {
    for (const key of keys) {
      if (this.textures.exists(key)) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }
  }

  private makeSolidPlaceholder(
    key: string,
    color: number,
    w: number,
    h: number,
  ): void {
    if (this.textures.exists(key)) {
      this.textures.remove(key);
    }
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(color, 1);
    g.fillRect(0, 0, w, h);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  /** 缺失弹丸贴图时：8×8 白色圆点占位 */
  private makeProjectilePlaceholder(key: string): void {
    if (this.textures.exists(key)) {
      this.textures.remove(key);
    }
    const size = 8;
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(size / 2, size / 2, size / 2 - 0.5);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  /**
   * 玩家占位：蓝发人鱼女仆。
   * 发 #3d7eff、浅色脸、裙 #f4f1ea/#222、鱼尾 #7ec8ff、点缀 #e85d75。
   * 按动画名做微小姿态差异。
   */
  private makePlayerPlaceholder(key: string): void {
    if (this.textures.exists(key)) {
      this.textures.remove(key);
    }

    const g = this.make.graphics({ x: 0, y: 0 });
    const cx = PLACEHOLDER_W / 2;
    let lean = 0;
    let bodyY = 0;
    let lying = false;

    if (key.includes('attack')) {
      lean = 8;
    } else if (key.includes('hurt')) {
      lean = -6;
      bodyY = 4;
    } else if (key.includes('dead')) {
      lying = true;
    } else if (key.includes('jump')) {
      bodyY = -4;
    } else if (key.includes('fall')) {
      bodyY = 2;
    } else if (key.includes('run')) {
      lean = 3;
    }

    if (lying) {
      // 死亡：横向躺倒
      g.fillStyle(0x3d7eff, 1);
      g.fillEllipse(cx, 88, 70, 28);
      g.fillStyle(0xf0d5c8, 1);
      g.fillCircle(cx + 28, 88, 14);
      g.fillStyle(0xf4f1ea, 1);
      g.fillRect(cx - 40, 78, 50, 22);
      g.fillStyle(0x222222, 1);
      g.fillRect(cx - 40, 92, 50, 10);
      g.fillStyle(0x7ec8ff, 1);
      g.fillEllipse(cx - 48, 90, 36, 18);
      g.fillStyle(0xe85d75, 1);
      g.fillCircle(cx + 20, 78, 4);
    } else {
      const ox = lean;
      const oy = bodyY;

      // 鱼尾
      g.fillStyle(0x7ec8ff, 1);
      g.fillTriangle(
        cx + ox - 6,
        100 + oy,
        cx + ox + 10,
        100 + oy,
        cx + ox - 4,
        124 + oy,
      );
      g.fillEllipse(cx + ox - 2, 118 + oy, 28, 14);

      // 裙身
      g.fillStyle(0xf4f1ea, 1);
      g.fillRect(cx + ox - 16, 62 + oy, 32, 28);
      g.fillStyle(0x222222, 1);
      g.fillRect(cx + ox - 16, 86 + oy, 32, 14);
      g.fillStyle(0xe85d75, 1);
      g.fillRect(cx + ox - 16, 84 + oy, 32, 3);

      // 躯干与头
      g.fillStyle(0xf4f1ea, 1);
      g.fillRect(cx + ox - 10, 42 + oy, 20, 22);
      g.fillStyle(0xf0d5c8, 1);
      g.fillCircle(cx + ox, 30 + oy, 14);

      // 蓝发
      g.fillStyle(0x3d7eff, 1);
      g.fillEllipse(cx + ox, 22 + oy, 36, 28);
      g.fillRect(cx + ox - 18, 22 + oy, 10, 36);
      g.fillRect(cx + ox + 8, 22 + oy, 10, 36);

      // 点缀发饰
      g.fillStyle(0xe85d75, 1);
      g.fillCircle(cx + ox + 12, 16 + oy, 4);

      if (key.includes('attack')) {
        // 攻击前倾：伸出一只「手臂」
        g.fillStyle(0xf0d5c8, 1);
        g.fillRect(cx + ox + 10, 48 + oy, 22, 6);
      }
    }

    g.generateTexture(key, PLACEHOLDER_W, PLACEHOLDER_H);
    g.destroy();
  }

  /** Boss 内核缺图兜底：黑底红叉大块，96×128 */
  private makeCorePlaceholder(key: string): void {
    if (this.textures.exists(key)) {
      this.textures.remove(key);
    }
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x14080c, 1);
    g.fillRect(0, 0, PLACEHOLDER_W, PLACEHOLDER_H);
    g.lineStyle(6, 0xff3b3b, 1);
    g.strokeRect(6, 6, PLACEHOLDER_W - 12, PLACEHOLDER_H - 12);
    g.lineBetween(20, 20, PLACEHOLDER_W - 20, PLACEHOLDER_H - 20);
    g.lineBetween(PLACEHOLDER_W - 20, 20, 20, PLACEHOLDER_H - 20);
    g.generateTexture(key, PLACEHOLDER_W, PLACEHOLDER_H);
    g.destroy();
  }

  /**
   * 敌人占位：木头木人。主体色按 kind 传入；受击变暗；死亡倒下。
   */
  private makeEnemyPlaceholder(key: string, color: number): void {
    if (this.textures.exists(key)) {
      this.textures.remove(key);
    }

    const g = this.make.graphics({ x: 0, y: 0 });
    const cx = PLACEHOLDER_W / 2;
    const wood = key.includes('hurt') ? 0x8a7048 : color;
    const dark = key.includes('hurt') ? 0x5a4830 : 0x8a6e48;

    if (key.includes('dead')) {
      g.fillStyle(wood, 1);
      g.fillEllipse(cx, 100, 78, 28);
      g.fillStyle(dark, 1);
      g.fillCircle(cx + 30, 100, 16);
      g.fillStyle(0x3a2e1e, 1);
      g.fillCircle(cx + 26, 96, 3);
      g.fillCircle(cx + 34, 96, 3);
    } else {
      let lean = 0;
      if (key.includes('attack')) {
        lean = 6;
      } else if (key.includes('hurt')) {
        lean = -4;
      }

      // 桩身
      g.fillStyle(wood, 1);
      g.fillRect(cx + lean - 16, 40, 32, 72);
      // 头
      g.fillStyle(wood, 1);
      g.fillCircle(cx + lean, 32, 18);
      g.fillStyle(dark, 1);
      g.fillCircle(cx + lean, 32, 14);
      // 眼睛
      g.fillStyle(0x2a2010, 1);
      g.fillCircle(cx + lean - 5, 30, 3);
      g.fillCircle(cx + lean + 5, 30, 3);
      // 横纹
      g.lineStyle(2, dark, 0.7);
      g.strokeLineShape(
        new Phaser.Geom.Line(cx + lean - 14, 60, cx + lean + 14, 60),
      );
      g.strokeLineShape(
        new Phaser.Geom.Line(cx + lean - 14, 80, cx + lean + 14, 80),
      );

      if (key.includes('attack')) {
        g.fillStyle(dark, 1);
        g.fillRect(cx + lean + 12, 55, 24, 8);
      }
    }

    g.generateTexture(key, PLACEHOLDER_W, PLACEHOLDER_H);
    g.destroy();
  }
}
