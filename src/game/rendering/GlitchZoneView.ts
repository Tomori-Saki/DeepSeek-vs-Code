import Phaser from 'phaser';
import type { GlitchZone } from '../simulation/GlitchZone';

interface ZoneObjects {
  rect: Phaser.GameObjects.Rectangle;
  scanlines: Phaser.GameObjects.Graphics;
}

/**
 * 故障场视图：洋红底 + 青色扫描线。
 * 纯渲染，只读 state.glitchZones；扫描线抖动用帧号哈希，不用 Math.random()。
 */
export class GlitchZoneView {
  private readonly scene: Phaser.Scene;
  private readonly zones = new Map<number, ZoneObjects>();

  private static readonly WIDTH = 140;
  private static readonly HEIGHT = 14;
  private static readonly DEPTH = 17;
  private static readonly FILL = 0xff2fd0;
  private static readonly SCAN = 0x5de8ff;
  private static readonly ALPHA_BASE = 0.3;
  private static readonly ALPHA_BLINK = 0.1;
  /** 最后 30 帧每 6 帧闪一次 */
  private static readonly BLINK_THRESHOLD = 30;
  private static readonly BLINK_PERIOD = 6;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  sync(zones: readonly GlitchZone[], frame: number): void {
    const aliveIds = new Set<number>();
    for (const zone of zones) {
      aliveIds.add(zone.id);
      const objects = this.acquire(zone.id);
      const alpha = this.alphaFor(zone, frame);
      objects.rect.setPosition(Math.round(zone.x), Math.round(zone.y - 6));
      objects.rect.setAlpha(alpha);
      objects.scanlines.setPosition(Math.round(zone.x), Math.round(zone.y - 6));
      objects.scanlines.setAlpha(alpha);
      this.drawScanlines(objects.scanlines, zone.id, frame);
    }
    for (const [id, objects] of this.zones) {
      if (!aliveIds.has(id)) {
        objects.rect.destroy();
        objects.scanlines.destroy();
        this.zones.delete(id);
      }
    }
  }

  destroy(): void {
    for (const objects of this.zones.values()) {
      objects.rect.destroy();
      objects.scanlines.destroy();
    }
    this.zones.clear();
  }

  private acquire(id: number): ZoneObjects {
    const existing = this.zones.get(id);
    if (existing) return existing;
    const rect = this.scene.add
      .rectangle(0, 0, GlitchZoneView.WIDTH, GlitchZoneView.HEIGHT, GlitchZoneView.FILL)
      .setDepth(GlitchZoneView.DEPTH);
    const scanlines = this.scene.add.graphics().setDepth(GlitchZoneView.DEPTH + 1);
    const objects: ZoneObjects = { rect, scanlines };
    this.zones.set(id, objects);
    return objects;
  }

  /** 快消失时每 6 帧在 0.10 / 0.30 之间切换 */
  private alphaFor(zone: GlitchZone, frame: number): number {
    if (zone.framesLeft >= GlitchZoneView.BLINK_THRESHOLD) {
      return GlitchZoneView.ALPHA_BASE;
    }
    return Math.floor(frame / GlitchZoneView.BLINK_PERIOD) % 2 === 0
      ? GlitchZoneView.ALPHA_BLINK
      : GlitchZoneView.ALPHA_BASE;
  }

  /** 3 条横向扫描线，每 4 帧在 ±3px 内跳一次；伪随机来自帧号哈希 */
  private drawScanlines(gfx: Phaser.GameObjects.Graphics, zoneId: number, frame: number): void {
    gfx.clear();
    gfx.lineStyle(2, GlitchZoneView.SCAN, 0.9);
    const half = GlitchZoneView.WIDTH / 2;
    const tick = Math.floor(frame / 4);
    for (let i = 0; i < 3; i++) {
      const hash = ((tick * 2654435761 + zoneId * 97 + i * 13) % 1000) / 1000;
      const offsetY = Math.round((hash - 0.5) * 6) + (i - 1) * 4;
      gfx.lineBetween(-half + 4, offsetY, half - 4, offsetY);
    }
  }
}
