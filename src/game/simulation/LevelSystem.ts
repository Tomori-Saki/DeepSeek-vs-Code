import { overlap } from './CollisionSystem';
import { syncHurtbox } from './EntityState';
import type { GameState } from './GameState';

/** 计入出口的敌人清空后解锁出口；玩家碰到已解锁出口则通关。 */
export function updateLevel(state: GameState): void {
  if (state.match !== 'playing') return;

  if (state.player.position.y > state.fallDeathY) {
    state.player.health = 0;
    state.player.locomotion = 'dead';
    state.player.velocity.x = 0;
    state.player.velocity.y = 0;
    state.player.attackPhase = 'none';
    state.player.attackFramesLeft = 0;
    state.player.firedThisShot = false;
    state.projectiles = [];
    state.match = 'defeat';
    return;
  }

  // 兜底：坠出场地（或被击退出 support）的敌人按死亡结算，
  // 否则 countsTowardExit 的敌人永远卡在场地外，出口无法解锁
  for (const enemy of state.enemies) {
    if (
      enemy.health > 0 &&
      enemy.behavior !== 'dead' &&
      enemy.position.y > state.fallDeathY
    ) {
      enemy.health = 0;
      enemy.behavior = 'dead';
      enemy.velocity.x = 0;
      enemy.velocity.y = 0;
      enemy.hitbox = null;
      enemy.attackPhase = 'none';
      enemy.attackFramesLeft = 0;
    }
  }

  const allDead = state.enemies.every(
    (enemy) => enemy.countsTowardExit === false || enemy.health <= 0 || enemy.behavior === 'dead',
  );
  if (allDead) state.level.exitUnlocked = true;
  if (!state.level.exitUnlocked) return;

  syncHurtbox(state.player);
  const exit = state.exit;
  if (overlap(state.player.hurtbox, exit)) {
    state.match = 'levelCleared';
    state.clearFrames = 120;
    state.player.velocity.x = 0;
    state.player.velocity.y = 0;
  }
}
