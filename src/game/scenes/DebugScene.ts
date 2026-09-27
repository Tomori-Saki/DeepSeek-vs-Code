import Phaser from 'phaser';
import type { GameState } from '../simulation/GameState';
import type { Aabb } from '../simulation/EntityState';
import type { ProjectileState } from '../simulation/ProjectileState';

/**
 * 调试叠加层：只读 registry 里的 simState。
 * 不拦截键盘；文字用英文短标签。
 */
export default class DebugScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private label!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'DebugScene', active: false, visible: true });
  }

  create(): void {
    this.gfx = this.add.graphics().setDepth(1000);
    this.label = this.add
      .text(8, 8, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#c8f5c8',
        backgroundColor: '#00000088',
        padding: { x: 6, y: 4 },
      })
      .setDepth(1001)
      .setScrollFactor(0);

    // 不接收指针，避免挡操作
    this.input.enabled = false;
  }

  update(): void {
    const state = this.registry.get('simState') as GameState | undefined;
    if (!state) {
      return;
    }

    // 与 GameScene 相机 scroll 对齐，避免抖动时 hitbox 错位
    const gameScene = this.scene.get('GameScene') as Phaser.Scene | null;
    if (gameScene?.cameras?.main) {
      const cam = gameScene.cameras.main;
      this.cameras.main.setScroll(cam.scrollX, cam.scrollY);
    }

    if (!state.debug) {
      this.gfx.clear();
      this.label.setText('');
      this.label.setVisible(false);
      this.gfx.setVisible(false);
      return;
    }

    this.label.setVisible(true);
    this.gfx.setVisible(true);

    const fps = this.game.loop.actualFps;
    const p = state.player;
    const projectiles: readonly ProjectileState[] = state.projectiles ?? [];
    const aliveProj = projectiles.filter((pr) => pr.alive);
    const enemyLines = state.enemies.map(
      (e) => `${e.id} ${e.behavior} ${e.health}`,
    );

    this.label.setText(
      [
        `FPS ${fps.toFixed(0)}`,
        `match ${state.match} exit ${state.level.exitUnlocked ? 'open' : 'locked'}`,
        `loco ${p.locomotion} gun ${p.attackPhase}`,
        `proj ${aliveProj.length}/${projectiles.length}`,
        `vel ${p.velocity.x.toFixed(1)}, ${p.velocity.y.toFixed(1)}`,
        ...enemyLines,
      ].join('\n'),
    );

    this.gfx.clear();
    this.drawBox(p.hurtbox, 0x33ff66, 1);
    this.drawBox(state.exit, 0x66ccff, 1);
    for (const e of state.enemies) {
      this.drawBox(e.hurtbox, 0x33ff66, 1);
      if (e.hitbox) this.drawBox(e.hitbox, 0xff3355, 2);
    }
    for (const pr of aliveProj) {
      this.drawProjectile(pr);
    }
  }

  private drawBox(box: Aabb, color: number, lineWidth: number): void {
    this.gfx.lineStyle(lineWidth, color, 0.9);
    this.gfx.strokeRect(box.x, box.y, box.w, box.h);
  }

  /** 活着的弹丸：中心小圆 */
  private drawProjectile(pr: ProjectileState): void {
    const r = Math.max(2, pr.radius);
    this.gfx.lineStyle(1, 0xffee88, 0.95);
    this.gfx.strokeCircle(pr.x, pr.y, r);
  }
}
