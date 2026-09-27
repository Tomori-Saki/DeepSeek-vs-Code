import Phaser from 'phaser';
import type { EnemyState } from '../simulation/EnemyState';

/**
 * Boss P3 表现：蓄力预示线 + 冲撞起手的全屏白闪。
 * 纯渲染，只读 Boss 状态；不用 tween。
 */
export class FatalCoreView {
  private readonly scene: Phaser.Scene;
  private readonly telegraph: Phaser.GameObjects.Graphics;
  private readonly flash: Phaser.GameObjects.Rectangle;
  /** 上一帧的冲撞相位，用来抓 windup → charge 的边沿 */
  private lastPhase: string = 'none';
  private flashFrames = 0;

  private static readonly LINE_COLOR = 0xff3b3b;
  private static readonly LINE_HEIGHT = 6;
  private static readonly WINDUP_FRAMES = 40;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.telegraph = scene.add.graphics().setDepth(18);
    this.flash = scene.add
      .rectangle(0, 0, 10, 10, 0xffffff, 0.85)
      .setOrigin(0, 0)
      .setDepth(40)
      .setScrollFactor(0)
      .setVisible(false);
  }

  /** boss 为 undefined（不在 Boss 房）时全部隐藏 */
  sync(boss: EnemyState | undefined): void {
    this.telegraph.clear();

    if (!boss || boss.bossPhase !== 3 || boss.behavior === 'dead') {
      this.lastPhase = 'none';
      this.flashFrames = 0;
      this.flash.setVisible(false);
      return;
    }

    // 蓄力预示线：从场地两端向 Boss 收拢
    if (boss.chargePhase === 'windup') {
      const t = 1 - Math.max(0, boss.chargeFramesLeft) / FatalCoreView.WINDUP_FRAMES;
      const groundY = Math.round(boss.position.y);
      const leftEnd = boss.support.x;
      const rightEnd = boss.support.x + boss.support.w;
      const bossX = Math.round(boss.position.x);
      const leftTo = Math.round(leftEnd + (bossX - leftEnd) * t);
      const rightTo = Math.round(rightEnd - (rightEnd - bossX) * t);
      this.telegraph.fillStyle(FatalCoreView.LINE_COLOR, 0.85);
      this.telegraph.fillRect(leftEnd, groundY - FatalCoreView.LINE_HEIGHT, Math.max(0, leftTo - leftEnd), FatalCoreView.LINE_HEIGHT);
      this.telegraph.fillRect(rightTo, groundY - FatalCoreView.LINE_HEIGHT, Math.max(0, rightEnd - rightTo), FatalCoreView.LINE_HEIGHT);
    }

    // 收拢完成（windup → charge）的那一帧起全屏白闪 2 帧
    if (this.lastPhase === 'windup' && boss.chargePhase === 'charge') {
      this.flashFrames = 2;
    }
    this.lastPhase = boss.chargePhase;

    if (this.flashFrames > 0) {
      this.flashFrames -= 1;
      const cam = this.scene.cameras.main;
      this.flash.setSize(cam.width, cam.height);
      this.flash.setVisible(true);
    } else {
      this.flash.setVisible(false);
    }
  }

  destroy(): void {
    this.telegraph.destroy();
    this.flash.destroy();
  }
}
