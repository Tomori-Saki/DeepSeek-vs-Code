import Phaser from 'phaser';
import type { ExitRect } from '../levels/level1';

export type ExitPhase = 'locked' | 'unlocked' | 'entered';

/**
 * 代码终端门。只负责三态外观，解锁和碰撞仍由 LevelSystem 决定。
 */
export class ExitView {
  private readonly screen: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private readonly braces: Phaser.GameObjects.Text[] = [];
  private phase: ExitPhase = 'locked';

  constructor(scene: Phaser.Scene, exit: ExitRect) {
    const cx = exit.x + exit.w / 2;
    const cy = exit.y + exit.h / 2;
    const font = '"Press Start 2P", monospace';

    this.braces.push(
      scene.add
        .text(exit.x - 6, cy, '{', { fontFamily: font, fontSize: '28px', color: '#9ad7ff' })
        .setOrigin(1, 0.5)
        .setDepth(18),
      scene.add
        .text(exit.x + exit.w + 6, cy, '}', { fontFamily: font, fontSize: '28px', color: '#9ad7ff' })
        .setOrigin(0, 0.5)
        .setDepth(18),
    );

    this.screen = scene.add
      .rectangle(cx, cy, exit.w, exit.h, 0x071426)
      .setStrokeStyle(2, 0xff3355)
      .setDepth(17);
    this.label = scene.add
      .text(cx, cy, 'ERR', { fontFamily: font, fontSize: '10px', color: '#ff3355' })
      .setOrigin(0.5)
      .setDepth(19);
  }

  setPhase(phase: ExitPhase): void {
    if (phase === this.phase) return;
    this.phase = phase;
    if (phase === 'unlocked') {
      this.screen.setFillStyle(0x062416);
      this.screen.setStrokeStyle(2, 0x3ddc97);
      this.label.setText('>_');
      this.label.setColor('#7dffb2');
      return;
    }
    if (phase === 'entered') {
      this.screen.setFillStyle(0x08301c);
      this.screen.setStrokeStyle(2, 0xd8ffe8);
      this.label.setText('OK');
      this.label.setColor('#d8ffe8');
      return;
    }
    this.screen.setFillStyle(0x071426);
    this.screen.setStrokeStyle(2, 0xff3355);
    this.label.setText('ERR');
    this.label.setColor('#ff3355');
  }

  /** 换关重建时调用，四个 GameObject 一起收掉 */
  destroy(): void {
    for (const brace of this.braces) brace.destroy();
    this.braces.length = 0;
    this.screen.destroy();
    this.label.destroy();
  }
}
