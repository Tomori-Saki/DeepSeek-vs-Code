import Phaser from 'phaser';

/** 弹丸上可选的落地预警进度（0..1），模拟层后续会补 */
type WarningProjectile = {
  kind?: string;
  alive: boolean;
  x: number;
  y: number;
  vy: number;
  lifetimeFrames: number;
  warningT?: number;
};

/**
 * Boss heap 抛物线弹的落地预示圈。
 * 只读弹丸当前坐标，不做物理；没有下落中的 heap 弹时圈全部隐藏。
 */
export class HeapWarningView {
  private readonly scene: Phaser.Scene;
  private readonly pool: Phaser.GameObjects.Graphics[] = [];
  private static readonly DEPTH = 16;
  private static readonly COLOR = 0x39f08a;
  /** 虚线实段 / 空段，单位是沿圆周的像素采样 */
  private static readonly DASH = 4;
  private static readonly GAP = 3;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  sync(
    projectiles: readonly {
      kind?: string;
      alive: boolean;
      x: number;
      y: number;
      vy: number;
      lifetimeFrames: number;
    }[],
    frame: number,
  ): void {
    let used = 0;

    for (const raw of projectiles) {
      const p = raw as WarningProjectile;
      if (!p.alive || p.kind !== 'heap' || !(p.vy > 0)) {
        continue;
      }

      const gfx = this.acquire(used);
      used += 1;

      const radius =
        typeof p.warningT === 'number'
          ? Math.round(90 - p.warningT * 70)
          : 48;

      gfx.setPosition(Math.round(p.x), Math.round(p.y));
      gfx.setVisible(true);
      this.paintRing(gfx, radius, frame);
    }

    for (let i = used; i < this.pool.length; i++) {
      this.pool[i].clear();
      this.pool[i].setVisible(false);
    }
  }

  destroy(): void {
    for (const g of this.pool) {
      g.destroy();
    }
    this.pool.length = 0;
  }

  private acquire(index: number): Phaser.GameObjects.Graphics {
    const existing = this.pool[index];
    if (existing) {
      return existing;
    }
    const gfx = this.scene.add.graphics();
    gfx.setDepth(HeapWarningView.DEPTH);
    gfx.setVisible(false);
    this.pool.push(gfx);
    return gfx;
  }

  /**
   * 像素虚线圈：整数格上的实段和空段。
   * frame 只平移虚线相位，不用 tween。
   */
  private paintRing(
    gfx: Phaser.GameObjects.Graphics,
    radius: number,
    frame: number,
  ): void {
    gfx.clear();
    if (radius <= 0) {
      return;
    }

    const samples = Math.max(16, Math.round(Math.PI * 2 * radius));
    const period = HeapWarningView.DASH + HeapWarningView.GAP;
    const phase = ((frame % period) + period) % period;
    gfx.fillStyle(HeapWarningView.COLOR, 1);

    for (let i = 0; i < samples; i++) {
      if ((i + phase) % period >= HeapWarningView.DASH) {
        continue;
      }
      const angle = (i / samples) * Math.PI * 2;
      const px = Math.round(Math.cos(angle) * radius);
      const py = Math.round(Math.sin(angle) * radius);
      gfx.fillRect(px, py, 1, 1);
    }
  }
}
