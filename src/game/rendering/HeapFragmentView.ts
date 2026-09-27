import Phaser from 'phaser';

/** 内存碎片视图数据：只读映射，不写回模拟 */
export interface HeapFragmentViewData {
  id: number;
  x: number;
  y: number;
  health: number;
  framesLeft: number;
  alive: boolean;
  hurtFrames?: number;
}

/**
 * Boss 落地后的内存碎片方块。
 * alpha 按模拟帧呼吸；受击闪白；池化，死亡的不画。
 */
export class HeapFragmentView {
  private readonly scene: Phaser.Scene;
  private readonly pool: Phaser.GameObjects.Rectangle[] = [];
  private static readonly DEPTH = 18;
  private static readonly SIZE = 20;
  private static readonly FILL = 0x2f6b4a;
  private static readonly STROKE = 0x39f08a;
  private static readonly HURT_FILL = 0xffffff;
  private static readonly PERIOD = 40;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  sync(fragments: readonly HeapFragmentViewData[], frame: number): void {
    let used = 0;
    // 周期 40 帧：0.45 ↔ 1.0 呼吸，三角波，不用 tween
    const phase = (frame % HeapFragmentView.PERIOD) / HeapFragmentView.PERIOD;
    const breath =
      phase < 0.5
        ? 0.45 + (1.0 - 0.45) * (phase * 2)
        : 0.45 + (1.0 - 0.45) * (2 - phase * 2);

    for (const f of fragments) {
      if (!f.alive) {
        continue;
      }

      const rect = this.acquire(used);
      used += 1;

      const hurt = (f.hurtFrames ?? 0) > 0;
      rect.setPosition(Math.round(f.x), Math.round(f.y));
      rect.setVisible(true);
      // 受击闪白时拉满，避免呼吸到 0.45 把白闪洗淡
      rect.setAlpha(hurt ? 1 : breath);

      if (hurt) {
        rect.setFillStyle(HeapFragmentView.HURT_FILL, 1);
        rect.setStrokeStyle(1, HeapFragmentView.HURT_FILL, 1);
      } else {
        rect.setFillStyle(HeapFragmentView.FILL, 1);
        rect.setStrokeStyle(1, HeapFragmentView.STROKE, 1);
      }
    }

    for (let i = used; i < this.pool.length; i++) {
      this.pool[i].setVisible(false);
    }
  }

  destroy(): void {
    for (const r of this.pool) {
      r.destroy();
    }
    this.pool.length = 0;
  }

  private acquire(index: number): Phaser.GameObjects.Rectangle {
    if (index < this.pool.length) {
      return this.pool[index];
    }
    const rect = this.scene.add
      .rectangle(0, 0, HeapFragmentView.SIZE, HeapFragmentView.SIZE, HeapFragmentView.FILL)
      .setOrigin(0.5, 0.5)
      .setStrokeStyle(1, HeapFragmentView.STROKE, 1)
      .setDepth(HeapFragmentView.DEPTH)
      .setVisible(false);
    this.pool.push(rect);
    return rect;
  }
}
