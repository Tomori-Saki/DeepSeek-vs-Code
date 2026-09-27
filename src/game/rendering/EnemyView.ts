import Phaser from 'phaser';
import { ENEMY_KIND_SPRITES } from '../assets/manifest';
import type { EnemyState } from '../simulation/EnemyState';
import { AfterimageView } from './AfterimageView';
import { EntityView } from './EntityView';
import { ENEMY_VISUAL, enemyDeathTransform, enemySpawnTransform } from './EnemyVisualParams';

/** 只有这两种 kind 留残影，颜色按种类固定 */
const AFTERIMAGE_TINT: Partial<Record<EnemyState['enemyKind'], number>> = {
  syntaxError: 0xff8a6a,
  runtimeGlitch: 0x7dffb0,
};

/** 按敌人 id 复用精灵，死亡后仍保留以便播死亡姿态。 */
export class EnemyView {
  private readonly scene: Phaser.Scene;
  private readonly afterimages: AfterimageView;
  private readonly views = new Map<string, EntityView>();
  private readonly deathStart = new Map<string, number>();
  private readonly spawnStart = new Map<string, number>();
  /** 上一帧的水平位置。第一次见到该 id 只记账，不生成残影 */
  private readonly lastX = new Map<string, number>();
  /** 上一轮 sync 看到的模拟帧。帧回绕说明重开，旧位置作废 */
  private lastSyncFrame = -1;

  constructor(scene: Phaser.Scene, afterimages: AfterimageView) {
    this.scene = scene;
    this.afterimages = afterimages;
  }

  sync(enemies: readonly EnemyState[], frame: number): void {
    if (frame < this.lastSyncFrame) {
      // 重开/换关后帧号回绕：旧视图的出生/死亡帧号都作废，全部销毁重建，
      // 否则出生缩入会用负的 elapsed 把敌人永久藏成 alpha 0
      for (const view of this.views.values()) {
        view.destroy();
      }
      this.views.clear();
      this.deathStart.clear();
      this.spawnStart.clear();
      this.lastX.clear();
    }
    this.lastSyncFrame = frame;

    const aliveIds = new Set<string>();
    for (const enemy of enemies) {
      aliveIds.add(enemy.id);
      let view = this.views.get(enemy.id);
      if (!view) {
        view = new EntityView(this.scene, 'enemy', ENEMY_KIND_SPRITES[enemy.enemyKind].key);
        this.views.set(enemy.id, view);
      }
      this.maybeSpawnAfterimage(enemy, frame);
      if (enemy.behavior === 'dead') {
        if (!this.deathStart.has(enemy.id)) this.deathStart.set(enemy.id, frame);
        const elapsed = frame - (this.deathStart.get(enemy.id) ?? frame);
        view.setDeathTransform(enemy, enemyDeathTransform(elapsed));
        view.setShadowVisible(false);
        continue;
      }
      this.deathStart.delete(enemy.id);
      if (!this.spawnStart.has(enemy.id)) this.spawnStart.set(enemy.id, frame);
      const spawnT = enemySpawnTransform(frame - (this.spawnStart.get(enemy.id) ?? frame));
      view.setShown(true);
      view.setSpawnTransform(spawnT.alpha, spawnT.scale);
      view.sync(enemy, frame);
      view.setShadow(enemy, ENEMY_VISUAL[enemy.enemyKind]);
    }
    for (const [id, view] of this.views) {
      if (!aliveIds.has(id)) {
        view.destroy();
        this.views.delete(id);
        this.deathStart.delete(id);
        this.spawnStart.delete(id);
        this.lastX.delete(id);
      }
    }
  }

  destroy(): void {
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
    this.deathStart.clear();
    this.spawnStart.clear();
    this.lastX.clear();
  }

  /**
   * 已有上一帧、水平位移超过 22、且 kind 允许时，在旧 x、当前 y 留一张残影。
   * 死亡和第一次出现都不生成。
   */
  private maybeSpawnAfterimage(enemy: EnemyState, frame: number): void {
    const prevX = this.lastX.get(enemy.id);
    this.lastX.set(enemy.id, enemy.position.x);
    if (prevX === undefined || enemy.behavior === 'dead') {
      return;
    }
    const tint = AFTERIMAGE_TINT[enemy.enemyKind];
    if (tint === undefined || Math.abs(enemy.position.x - prevX) <= 22) {
      return;
    }
    const facing: -1 | 1 = enemy.facing < 0 ? -1 : 1;
    this.afterimages.spawn({
      textureKey: ENEMY_KIND_SPRITES[enemy.enemyKind].key,
      x: prevX,
      y: enemy.position.y,
      facing,
      bornFrame: frame,
      tint,
    });
  }
}
