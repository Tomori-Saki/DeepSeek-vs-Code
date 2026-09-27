import Phaser from 'phaser';
import type { PlatformRect } from '../config';
import {
  KENNEY_BG_KEY,
  KENNEY_GROUND_KEY,
} from '../assets/manifest';

/**
 * 三层竞技场视图：bg 0 / mid 10 / fg 30。
 * 角色 depth 20，夹在中景与前景之间。
 * 背景和平台按关卡世界宽度铺开，不只画视口那 960 像素。
 */
export class ArenaView {
  private readonly bgRoot: Phaser.GameObjects.Container;
  private readonly midRoot: Phaser.GameObjects.Container;
  private readonly fgRoot: Phaser.GameObjects.Container;
  private readonly disposables: Phaser.GameObjects.GameObject[] = [];
  private readonly worldWidth: number;
  private readonly worldHeight: number;

  constructor(
    scene: Phaser.Scene,
    platforms: readonly PlatformRect[],
    worldWidth: number,
    worldHeight: number,
  ) {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.bgRoot = scene.add.container(0, 0).setDepth(0);
    this.midRoot = scene.add.container(0, 0).setDepth(10);
    this.fgRoot = scene.add.container(0, 0).setDepth(30);

    this.buildBackground(scene);
    this.buildPits(scene, platforms);
    this.buildPlatforms(scene, platforms);
    this.buildForeground(scene);
  }

  private track<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.disposables.push(obj);
    return obj;
  }

  private buildBackground(scene: Phaser.Scene): void {
    // 深蓝天空底，再加更深远景色块，让角色读得清楚
    const sky = this.track(
      scene.add.rectangle(
        this.worldWidth / 2,
        this.worldHeight / 2,
        this.worldWidth,
        this.worldHeight,
        0x1a2240,
      ),
    );
    this.bgRoot.add(sky);

    const farBlocks: Array<{ x: number; y: number; w: number; h: number }> = [
      { x: 120, y: 420, w: 200, h: 180 },
      { x: 380, y: 400, w: 160, h: 200 },
      { x: 620, y: 430, w: 220, h: 160 },
      { x: 850, y: 410, w: 140, h: 190 },
    ];
    for (const b of farBlocks) {
      const block = this.track(
        scene.add.rectangle(b.x, b.y, b.w, b.h, 0x12182c).setAlpha(0.85),
      );
      this.bgRoot.add(block);
    }

    if (scene.textures.exists(KENNEY_BG_KEY)) {
      const tile = this.track(
        scene.add
          .tileSprite(
            this.worldWidth / 2,
            this.worldHeight / 2,
            this.worldWidth,
            this.worldHeight,
            KENNEY_BG_KEY,
          )
          .setAlpha(0.35),
      );
      tile.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.bgRoot.add(tile);
    }
  }

  /** 地面之间的空隙画成深坑，提示掉下去会失败。 */
  private buildPits(scene: Phaser.Scene, platforms: readonly PlatformRect[]): void {
    const grounds = platforms
      .filter((p) => p.y >= 440)
      .slice()
      .sort((a, b) => a.x - b.x);
    for (let i = 0; i < grounds.length - 1; i++) {
      const left = grounds[i].x + grounds[i].w;
      const right = grounds[i + 1].x;
      if (right - left < 24) continue;
      const pit = this.track(
        scene.add.rectangle(
          (left + right) / 2,
          this.worldHeight - 36,
          right - left,
          72,
          0x070814,
        ),
      );
      this.bgRoot.add(pit);
    }
  }

  private buildPlatforms(
    scene: Phaser.Scene,
    platforms: readonly PlatformRect[],
  ): void {
    const hasGround = scene.textures.exists(KENNEY_GROUND_KEY);

    for (const p of platforms) {
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      const isGround = p.id === 'ground';

      if (hasGround) {
        const tile = this.track(
          scene.add.tileSprite(cx, cy, p.w, p.h, KENNEY_GROUND_KEY),
        );
        tile.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        this.midRoot.add(tile);
      } else {
        // 无纹理时：地面偏亮，悬崖略浅
        const color = isGround ? 0x5a6a88 : 0x4a5870;
        const rect = this.track(scene.add.rectangle(cx, cy, p.w, p.h, color));
        this.midRoot.add(rect);
      }
    }
  }

  private buildForeground(scene: Phaser.Scene): void {
    // 最底边一条很矮的暗色装饰，不挡脚、不盖住角色
    const strip = this.track(
      scene.add
        .rectangle(this.worldWidth / 2, this.worldHeight - 4, this.worldWidth, 8, 0x0a0e18)
        .setAlpha(0.55),
    );
    this.fgRoot.add(strip);
  }

  destroy(): void {
    // 销毁容器会一并带走子节点；勿再对子节点二次 destroy
    this.disposables.length = 0;
    this.bgRoot.destroy(true);
    this.midRoot.destroy(true);
    this.fgRoot.destroy(true);
  }
}
