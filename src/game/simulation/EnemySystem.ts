import { SIM } from '../config';
import { updateBoss } from './BossSystem';
import { spawnNullProjectile } from './CombatSystem';
import { applyGravity, syncHurtbox } from './EntityState';
import { pushGlitchZone } from './GlitchZoneSystem';
import type { EnemyState } from './EnemyState';
import type { GameState } from './GameState';
import type { PlayerState } from './PlayerState';

/**
 * 地面哨兵 AI。不跳跃；走到所站平台边缘就停，避免掉出场地。
 */
export function updateEnemies(state: GameState): void {
  for (const enemy of state.enemies) {
    // Boss 走专属循环，不进杂兵状态机
    if (enemy.enemyKind === 'outOfMemoryError') {
      updateBoss(enemy, state);
      continue;
    }
    updateOne(enemy, state.player, state);
  }
  // 死亡演出结束后清掉杂兵尸体；Boss 保留（dead 分支每帧清墙与波）
  if (state.enemies.some((enemy) => enemy.behavior === 'dead')) {
    state.enemies = state.enemies.filter(
      (enemy) =>
        enemy.enemyKind === 'outOfMemoryError' ||
        enemy.behavior !== 'dead' ||
        enemy.deathFrames <= DEATH_LINGER_FRAMES,
    );
  }
}

/** 死亡演出时长（帧），与渲染层 enemyDeathTransform 的消散终点一致 */
const DEATH_LINGER_FRAMES = 21;

function updateOne(enemy: EnemyState, player: PlayerState, state: GameState): void {
  if (enemy.blinkCooldownFrames > 0) enemy.blinkCooldownFrames -= 1;
  if (enemy.behavior === 'dead' || enemy.health <= 0) {
    enemy.behavior = 'dead';
    enemy.velocity.x = 0;
    enemy.velocity.y = 0;
    enemy.hitbox = null;
    enemy.attackPhase = 'none';
    enemy.deathFrames += 1;
    if (!enemy.grounded) applyGravity(enemy);
    syncHurtbox(enemy);
    return;
  }

  if (enemy.hurtFrames > 0) {
    enemy.hurtFrames -= 1;
    enemy.behavior = 'hurt';
    enemy.attackPhase = 'none';
    enemy.attackFramesLeft = 0;
    enemy.hitbox = null;
    enemy.velocity.x *= 0.86;
    applyGravity(enemy);
    // 受击击退同样受 support 边界钳制，避免被推出平台坠落卡死出口
    keepOnSupport(enemy);
    syncHurtbox(enemy);
    return;
  }

  if (enemy.attackPhase !== 'none') {
    advanceAttack(enemy, state);
  }

  if (enemy.attackCooldownFrames > 0) {
    enemy.attackCooldownFrames -= 1;
  }

  if (enemy.attackPhase === 'none') {
    decide(enemy, player, state);
  } else {
    // 突进赋值必须在 advanceAttack（会清零 vx）之后执行并胜出。
    // dashFrames>0：dashFramesLeft 初值是 dashFrames+5，高出的帧是前摇，vx 保持 0。
    // dashFrames===0：有剩余帧就直接按 dashSpeed 位移（S2，含测试里被改成 0 的 syntaxError）。
    enemy.behavior = 'attack';
    if (enemy.attackPhase === 'startup' && enemy.dashFramesLeft > 0) {
      const winding = enemy.dashFrames > 0 && enemy.dashFramesLeft > enemy.dashFrames;
      enemy.dashFramesLeft -= 1;
      enemy.velocity.x = winding ? 0 : enemy.facing * enemy.dashSpeed;
    } else {
      enemy.velocity.x = 0;
    }
  }

  if (enemy.grounded && enemy.velocity.y >= 0) {
    enemy.velocity.y = 0;
  } else {
    applyGravity(enemy);
  }
  keepOnSupport(enemy);
  syncHurtbox(enemy);
}

function advanceAttack(enemy: EnemyState, state: GameState): void {
  enemy.behavior = 'attack';
  enemy.velocity.x = 0;
  enemy.attackFramesLeft -= 1;
  if (enemy.attackFramesLeft > 0) return;

  if (enemy.attackPhase === 'startup') {
    enemy.attackPhase = 'active';
    enemy.attackFramesLeft = enemy.attackActiveFrames;
    enemy.hitApplied = false;
    if (isRanged(enemy)) spawnNullProjectile(state, enemy);
    return;
  }
  if (enemy.attackPhase === 'active') {
    // 多段攻击：还有下一段则回到 startup，不进 recovery
    if (enemy.comboIndex < enemy.comboSegments - 1) {
      enemy.attackPhase = 'startup';
      enemy.attackFramesLeft =
        enemy.comboStartupFrames > 0
          ? enemy.comboStartupFrames
          : enemy.attackStartupFrames;
      enemy.comboIndex += 1;
      // 段间 startup 不位移，避免第一段剩下的突进帧带到第二段
      enemy.dashFramesLeft = 0;
      enemy.hitApplied = false;
      enemy.hitbox = null;
      return;
    }
    // active → recovery 才结算叠层。overflow 清零且不再 +1；普通攻击 +1 封顶 stackMax。
    // 不在 active 中途改 stackDepth，避免同一段 active 的判定盒中途变大。
    if (enemy.enemyKind === 'stackOverflowError') {
      if (enemy.attackVariant === 'overflow') {
        enemy.stackDepth = 0;
      } else {
        enemy.stackDepth = Math.min(enemy.stackMax, enemy.stackDepth + 1);
      }
    }
    enemy.attackPhase = 'recovery';
    enemy.attackFramesLeft = enemy.attackRecoveryFrames;
    enemy.hitApplied = false;
    enemy.hitbox = null;
    return;
  }
  enemy.attackPhase = 'none';
  enemy.attackFramesLeft = 0;
  enemy.hitApplied = false;
  enemy.hitbox = null;
  enemy.attackVariant = 'normal';
}

function decide(enemy: EnemyState, player: PlayerState, state: GameState): void {
  const dx = player.position.x - enemy.position.x;
  const adx = Math.abs(dx);
  const dy = Math.abs(player.position.y - enemy.position.y);
  const playerAlive = player.health > 0 && player.locomotion !== 'dead';
  if (isRanged(enemy)) {
    decideRanged(enemy, playerAlive, dx, adx, dy);
    return;
  }
  if (isGlitch(enemy)) {
    decideGlitch(enemy, player, state, dx, adx, dy);
    return;
  }

  // syntaxError 中距离突进，写在贴脸普攻之前。
  // 水平 90–200，竖直与贴脸普攻同一窗口：人还在高处时不开始这一套二连。
  if (
    enemy.enemyKind === 'syntaxError' &&
    playerAlive &&
    enemy.grounded &&
    enemy.attackCooldownFrames === 0 &&
    adx >= 90 &&
    adx <= 200 &&
    dy < 48
  ) {
    enemy.facing = dx < 0 ? -1 : 1;
    enemy.behavior = 'attack';
    enemy.attackPhase = 'startup';
    armAttackVariant(enemy);
    enemy.attackFramesLeft = enemy.attackStartupFrames;
    enemy.comboIndex = 0;
    enemy.dashFramesLeft = enemy.dashFrames + 5;
    enemy.attackCooldownFrames = enemy.attackCooldownMax;
    enemy.hitApplied = false;
    enemy.velocity.x = 0;
    return;
  }

  const inAttack = playerAlive && adx < enemy.attackRange && dy < 48 && enemy.grounded;
  const inAlert = playerAlive && adx < enemy.alertRange;

  if (inAttack && enemy.attackCooldownFrames === 0) {
    enemy.facing = dx < 0 ? -1 : 1;
    enemy.behavior = 'attack';
    enemy.attackPhase = 'startup';
    armAttackVariant(enemy);
    enemy.attackFramesLeft = enemy.attackStartupFrames;
    enemy.hitApplied = false;
    enemy.comboIndex = 0;
    // 贴脸普攻不突进；连段仍由 comboSegments 决定
    enemy.dashFramesLeft = 0;
    enemy.attackCooldownFrames = enemy.attackCooldownMax;
    enemy.velocity.x = 0;
    return;
  }

  if (inAlert) {
    enemy.facing = dx < 0 ? -1 : 1;
    if (enemy.behavior !== 'alert' && enemy.behavior !== 'chase') {
      enemy.behavior = 'alert';
      enemy.alertFramesLeft = 18;
      enemy.velocity.x = 0;
      return;
    }
    if (enemy.behavior === 'alert') {
      enemy.alertFramesLeft -= 1;
      enemy.velocity.x = 0;
      if (enemy.alertFramesLeft <= 0) enemy.behavior = 'chase';
      return;
    }
    enemy.behavior = 'chase';
    enemy.velocity.x = (dx < 0 ? -1 : 1) * enemy.chaseSpeed;
    return;
  }

  patrol(enemy);
}

/**
 * 进入新攻击先标 normal，再判断满层。
 * 只在 decide 的两处 startup 调用；段间回 startup 不重新判定。
 */
function armAttackVariant(enemy: EnemyState): void {
  enemy.attackVariant = 'normal';
  if (
    enemy.enemyKind === 'stackOverflowError' &&
    enemy.stackDepth === enemy.stackMax
  ) {
    enemy.attackVariant = 'overflow';
  }
}

function decideRanged(
  enemy: EnemyState,
  playerAlive: boolean,
  dx: number,
  adx: number,
  dy: number,
): void {
  if (!playerAlive) {
    patrol(enemy);
    return;
  }
  enemy.facing = dx < 0 ? -1 : 1;
  if (adx < 90) {
    enemy.behavior = 'chase';
    enemy.velocity.x = (dx < 0 ? 1 : -1) * enemy.patrolSpeed;
    return;
  }
  // null 弹是水平直线（vy=0），玩家在高台上时打不中；不开火省冷却
  if (
    adx < enemy.attackRange &&
    dy < 48 &&
    enemy.attackCooldownFrames === 0 &&
    enemy.grounded
  ) {
    enemy.behavior = 'attack';
    enemy.attackPhase = 'startup';
    enemy.attackFramesLeft = enemy.attackStartupFrames;
    enemy.hitApplied = false;
    enemy.comboIndex = 0;
    enemy.dashFramesLeft = enemy.dashFrames;
    enemy.attackCooldownFrames = enemy.attackCooldownMax;
    enemy.velocity.x = 0;
    return;
  }
  patrol(enemy);
}

/** 近距离普攻（|dx| < 36）的独立数值：startup 10 / active 4 / recovery 20，伤害 10 */
const GLITCH_MELEE = { startup: 10, active: 4, recovery: 20, damage: 10 } as const;

function decideGlitch(
  enemy: EnemyState,
  player: PlayerState,
  state: GameState,
  dx: number,
  adx: number,
  dy: number,
): void {
  const playerAlive = player.health > 0 && player.locomotion !== 'dead';

  // 贴脸普攻：不瞬移，直接起手
  if (
    playerAlive &&
    adx < 36 &&
    dy < 48 &&
    enemy.grounded &&
    enemy.attackCooldownFrames === 0
  ) {
    enemy.facing = dx < 0 ? -1 : 1;
    enemy.behavior = 'attack';
    enemy.attackPhase = 'startup';
    enemy.attackStartupFrames = GLITCH_MELEE.startup;
    enemy.attackActiveFrames = GLITCH_MELEE.active;
    enemy.attackRecoveryFrames = GLITCH_MELEE.recovery;
    enemy.damage = GLITCH_MELEE.damage;
    enemy.attackFramesLeft = enemy.attackStartupFrames;
    enemy.hitApplied = false;
    enemy.comboIndex = 0;
    enemy.dashFramesLeft = 0;
    enemy.attackCooldownFrames = enemy.attackCooldownMax;
    enemy.velocity.x = 0;
    return;
  }

  if (
    playerAlive &&
    enemy.blinkCooldownFrames === 0 &&
    enemy.grounded &&
    adx < enemy.alertRange &&
    adx > 36 &&
    dy < 80
  ) {
    const oldX = enemy.position.x;
    const step = Math.sign(dx) * Math.min(64, adx - 36);
    const half = enemy.width / 2;
    const minX = enemy.support.x + half;
    const maxX = enemy.support.x + enemy.support.w - half;
    enemy.position.x = Math.max(minX, Math.min(maxX, enemy.position.x + step));
    // 瞬移前的旧位置留下故障场
    pushGlitchZone(state, oldX, enemy.position.y);
    // 瞬移后立刻接闪现斩，修掉「只追不打」的洞
    enemy.facing = dx < 0 ? -1 : 1;
    enemy.behavior = 'attack';
    enemy.attackPhase = 'startup';
    enemy.attackStartupFrames = 8;
    enemy.attackActiveFrames = 4;
    enemy.attackRecoveryFrames = 18;
    enemy.damage = 8;
    enemy.attackFramesLeft = enemy.attackStartupFrames;
    enemy.hitApplied = false;
    enemy.comboIndex = 0;
    enemy.dashFramesLeft = 0;
    // attackCooldown 与瞬移冷却同源，都是 96
    enemy.attackCooldownFrames = enemy.attackCooldownMax;
    enemy.blinkCooldownFrames = enemy.attackCooldownMax;
    enemy.velocity.x = 0;
    return;
  }
  patrol(enemy);
}

function patrol(enemy: EnemyState): void {
  enemy.behavior = 'patrol';
  if (enemy.position.x <= enemy.patrolMinX) enemy.facing = 1;
  else if (enemy.position.x >= enemy.patrolMaxX) enemy.facing = -1;
  enemy.velocity.x = enemy.facing * enemy.patrolSpeed;
}

/** 下一步若会离开脚下平台或巡逻锚点，就停住并在巡逻时转向。 */
function keepOnSupport(enemy: EnemyState): void {
  const half = enemy.width / 2;
  const minX = enemy.support.x + half;
  const maxX = enemy.support.x + enemy.support.w - half;
  const next = enemy.position.x + enemy.velocity.x * SIM.fixedDt;
  const pastSupport = next < minX || next > maxX;
  // 攻击期间（含突进）不因巡逻锚点停下，仍受 support 边界钳制
  const pastPatrol =
    enemy.behavior === 'patrol' &&
    enemy.attackPhase === 'none' &&
    (next < enemy.patrolMinX || next > enemy.patrolMaxX);
  if (!pastSupport && !pastPatrol) return;
  enemy.velocity.x = 0;
  if (enemy.behavior === 'patrol') {
    enemy.facing = enemy.facing === 1 ? -1 : 1;
  }
}

function isRanged(enemy: EnemyState): boolean {
  return enemy.enemyKind === 'nullPointerException';
}

function isGlitch(enemy: EnemyState): boolean {
  return enemy.enemyKind === 'runtimeGlitch';
}
