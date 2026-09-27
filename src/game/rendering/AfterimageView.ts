import Phaser from 'phaser';

/** 残影出生参数：位置、朝向和出生帧都由调用方给出 */
export interface AfterimageSpec {
  textureKey: string;
  x: number;
  y: number;
  facing: -1 | 1;
  bornFrame: number;
  tint: number;
}

interface Ghost {
  sprite: Phaser.GameObjects.Sprite;
  bornFrame: number;
}

/**
 * 残影视图：最多 12 个，按出生顺序淘汰最旧的。
 * alpha 按存活帧线性降到 0，不用 tween。
 */
export class AfterimageView {
  private readonly scene: Phaser.Scene;
  private readonly ghosts: Ghost[] = [];

  /** 同时存在的残影上限 */
  private static readonly MAX = 12;
  /** 画在角色脚底阴影之下 */
  private static readonly DEPTH = 18;
  /** 出生时的不透明度 */
  private static readonly ALPHA_START = 0.45;
  /** 淡出持续帧数，超过后销毁 */
  private static readonly FADE_FRAMES = 8;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** 生成一张残影；超过上限时销毁最旧的 */
  spawn(spec: AfterimageSpec): void {
    while (this.ghosts.length >= AfterimageView.MAX) {
      this.dropOldest();
    }

    const sprite = this.scene.add.sprite(
      Math.round(spec.x),
      Math.round(spec.y),
      spec.textureKey,
    );
    sprite.setOrigin(0.5, 1);
    sprite.setDepth(AfterimageView.DEPTH);
    sprite.setFlipX(spec.facing < 0);
    sprite.setTint(spec.tint);
    sprite.setAlpha(AfterimageView.ALPHA_START);
    this.applyNearest(spec.textureKey);

    this.ghosts.push({ sprite, bornFrame: spec.bornFrame });
  }

  /** 按当前模拟帧刷新透明度，超时的残影直接销毁 */
  sync(frame: number): void {
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const ghost = this.ghosts[i];
      const age = frame - ghost.bornFrame;
      // 重开时模拟帧回到 0，出生帧会落在未来，这种残影直接清掉
      if (age < 0 || age > AfterimageView.FADE_FRAMES) {
        ghost.sprite.destroy();
        this.ghosts.splice(i, 1);
        continue;
      }

      const t = age / AfterimageView.FADE_FRAMES;
      const alpha = AfterimageView.ALPHA_START * (1 - t);
      ghost.sprite.setAlpha(alpha);
    }
  }

  /** 清掉全部残影精灵 */
  destroy(): void {
    for (const ghost of this.ghosts) {
      ghost.sprite.destroy();
    }
    this.ghosts.length = 0;
  }

  private dropOldest(): void {
    const oldest = this.ghosts.shift();
    oldest?.sprite.destroy();
  }

  /** 像素风贴图用最近邻过滤，避免残影被线性模糊 */
  private applyNearest(textureKey: string): void {
    if (!this.scene.textures.exists(textureKey)) {
      return;
    }
    this.scene.textures
      .get(textureKey)
      .setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}
