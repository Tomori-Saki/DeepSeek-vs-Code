import { SIM } from '../config';
import { overlap } from './CollisionSystem';
import { spawnHeapShot } from './CombatSystem';
import { syncHurtbox } from './EntityState';
import { spawnEnemy, type EnemyState } from './EnemyState';
import type { GameState } from './GameState';

/** 内存墙厚度与高度 */
export const WALL_WIDTH = 48;
const WALL_HEIGHT = 240;
/** 墙的内边缘初始位置（最收回状态） */
const WALL_INITIAL_LEFT = 200;
export const WALL_INITIAL_RIGHT = 1800;
/** 墙推进的极限：给中场留 400px */
const WALL_MAX_LEFT = 800;
const WALL_MIN_RIGHT = 1200;
/** 挤压伤害与节流间隔（帧） */
const WALL_DAMAGE = 30;
const WALL_DAMAGE_INTERVAL = 60;
/** GC PAUSE 持续帧数 */
const GC_FRAMES = 300;
/** GC 结束后墙回到初始位置的帧数 */
const WALL_RETURN_FRAMES = 60;
/** 横扫波参数 */
const SWEEP_SPEED = 900;
const SWEEP_HEIGHT = 60;
const SWEEP_DAMAGE = 25;
const SWEEP_HALF_WIDTH = 10;
/** FATAL 转场帧数：期间 Boss 无敌且不动 */
const FATAL_FRAMES = 90;
/** P3 冲撞参数 */
const CHARGE_WINDUP_FRAMES = 40;
const CHARGE_SPEED = 600;
const CHARGE_MAX_DISTANCE = 1200;
const CHARGE_STUN_FRAMES = 120;
/** 召唤：每次冲撞后最多补 2 只，存活总数上限 4 */
const SUMMON_PER_CHARGE = 2;
const SUMMON_ALIVE_CAP = 4;
/** Boss 跳跃：玩家躲上高台时追上去。跳跃初速按 110px 升高设计 */
const BOSS_JUMP_VELOCITY = -680;
const BOSS_JUMP_COOLDOWN = 100;
/** 跳跃触发：玩家比 Boss 高 40px 以上且水平距离 400 以内 */
const BOSS_JUMP_DY = 40;
const BOSS_JUMP_DX = 400;

/** 场地主地面（最厚的那块板）的顶面 y；墙和召唤都贴它，不跟 Boss 站位浮动 */
function groundTop(state: GameState): number {
  const slab = state.platforms.find((p) => p.h >= 80);
  return slab ? slab.y : 440;
}

/**
 * Boss（outOfMemoryError）专属循环。不许塞进 EnemySystem.updateOne。
 * P1 LEAK：巡逻 + 每 150 帧 heapShot + 内存墙挤压。
 * P2 GC PAUSE：66% 血触发一次，全场冻结 300 帧后清碎片、回墙、放横扫波，节奏加快。
 */
export function updateBoss(boss: EnemyState, state: GameState): void {
  // 死亡：墙和波立刻消失
  if (boss.behavior === 'dead' || boss.health <= 0) {
    boss.behavior = 'dead';
    boss.velocity.x = 0;
    boss.velocity.y = 0;
    boss.hitbox = null;
    state.walls = [];
    state.hazards = [];
    syncHurtbox(boss);
    return;
  }

  boss.hitbox = null;
  boss.behavior = 'patrol';

  // 进 Boss 房时补齐两堵墙
  if (state.walls.length === 0) {
    state.walls = [
      { side: 'left', edgeX: WALL_INITIAL_LEFT, width: WALL_WIDTH, height: WALL_HEIGHT },
      { side: 'right', edgeX: WALL_INITIAL_RIGHT, width: WALL_WIDTH, height: WALL_HEIGHT },
    ];
  }

  // 66% 血触发一次 GC PAUSE
  if (boss.bossPhase === 1 && boss.health <= boss.maxHealth * 0.66) {
    boss.bossPhase = 2;
    boss.gcFrames = GC_FRAMES;
  }

  // 33% 血触发一次 FATAL（GC 走完才允许进 P3）
  if (
    boss.bossPhase === 2 &&
    boss.gcFrames === 0 &&
    boss.health <= boss.maxHealth * 0.33
  ) {
    boss.bossPhase = 3;
    boss.fatalFrames = FATAL_FRAMES;
    boss.chargePhase = 'none';
    boss.velocity.x = 0;
  }

  if (boss.fatalFrames > 0) {
    // FATAL 转场：Boss 无敌（applyProjectileHit 里挡）、不动
    boss.fatalFrames -= 1;
    boss.velocity.x = 0;
    if (boss.fatalFrames === 0 && boss.chargePhase === 'none') {
      boss.chargePhase = 'windup';
      boss.chargeFramesLeft = CHARGE_WINDUP_FRAMES;
    }
  } else if (boss.bossPhase === 3) {
    updateBossCharge(boss, state);
  } else if (boss.gcFrames > 0) {
    // GC PAUSE：Boss 不动、不攻击、不召唤；既有 heapShot 弹丸由 updateProjectiles 继续飞
    boss.gcFrames -= 1;
    boss.velocity.x = 0;
    if (boss.gcFrames === 0) {
      finishGcPause(boss, state);
    }
  } else {
    // P1 循环：在巡逻区间来回，定期朝玩家抛 heapShot；玩家上高台就跳起来追
    if (boss.grounded) {
      patrolBoss(boss);
    }
    boss.heapShotFramesLeft -= 1;
    if (boss.heapShotFramesLeft <= 0) {
      spawnHeapShot(state, boss, state.player.position.x);
      boss.heapShotFramesLeft = boss.attackCooldownMax;
    }
    maybeBossJump(boss, state);
  }

  updateWalls(boss, state);
  updateSweepWaves(state);
  enforceFragmentCap(state);

  // 重力与贴地（Boss 不跳跃）
  if (boss.grounded && boss.velocity.y >= 0) {
    boss.velocity.y = 0;
  } else {
    boss.velocity.y += SIM.gravity * SIM.fixedDt;
    if (boss.velocity.y > SIM.maxFallSpeed) boss.velocity.y = SIM.maxFallSpeed;
  }
  syncHurtbox(boss);
}

function patrolBoss(boss: EnemyState): void {
  if (boss.position.x <= boss.patrolMinX) boss.facing = 1;
  else if (boss.position.x >= boss.patrolMaxX) boss.facing = -1;
  boss.velocity.x = boss.facing * boss.patrolSpeed;
}

/**
 * 玩家躲上高台时 Boss 起跳追上去。
 * 空中水平速度按「0.65 秒滞空覆盖水平距离」预算，起跳后不再改 vx。
 */
function maybeBossJump(boss: EnemyState, state: GameState): void {
  if (boss.bossJumpCooldownFrames > 0) {
    boss.bossJumpCooldownFrames -= 1;
  }
  const player = state.player;
  const dx = player.position.x - boss.position.x;
  const playerAbove = player.position.y < boss.position.y - BOSS_JUMP_DY;
  if (
    !boss.grounded ||
    boss.bossJumpCooldownFrames > 0 ||
    !playerAbove ||
    Math.abs(dx) > BOSS_JUMP_DX ||
    player.locomotion === 'dead'
  ) {
    return;
  }
  boss.velocity.y = BOSS_JUMP_VELOCITY;
  boss.velocity.x = Math.max(-460, Math.min(460, dx / 0.65));
  boss.grounded = false;
  boss.bossJumpCooldownFrames = BOSS_JUMP_COOLDOWN;
}

/** GC 结束：清碎片、墙回初始位、放左右横扫波、节奏加快 */
function finishGcPause(boss: EnemyState, state: GameState): void {
  state.fragments = [];
  state.wallReturnFrames = WALL_RETURN_FRAMES;
  for (const dir of [-1, 1] as const) {
    state.hazards.push({
      id: state.nextHazardId,
      x: boss.position.x,
      y: boss.position.y,
      dir,
      speed: SWEEP_SPEED,
      height: SWEEP_HEIGHT,
      damage: SWEEP_DAMAGE,
      alive: true,
      hitApplied: false,
    });
    state.nextHazardId += 1;
  }
  // 节奏加快：heapShot 间隔 110、墙推速 ×1.5、碎片上限 +2
  boss.attackCooldownMax = 110;
  state.wallSpeedScale = 1.5;
  state.fragmentCap += 2;
}

function updateWalls(boss: EnemyState, state: GameState): void {
  if (state.wallDamageCooldown > 0) {
    state.wallDamageCooldown -= 1;
  }

  // GC 期间墙冻结
  if (boss.gcFrames > 0) return;

  // GC 后的回位：60 帧内线性回到初始 edgeX
  if (state.wallReturnFrames > 0) {
    state.wallReturnFrames -= 1;
    const remaining = state.wallReturnFrames + 1;
    for (const wall of state.walls) {
      const initial = wall.side === 'left' ? WALL_INITIAL_LEFT : WALL_INITIAL_RIGHT;
      wall.edgeX += (initial - wall.edgeX) / remaining;
    }
    return;
  }

  const fragmentCount = state.fragments.filter((f) => f.alive).length;
  // 碎片越多推得越快；没有碎片就缓慢退回初始位置
  let speed = Math.min(Math.max(fragmentCount * 2, 0), 30) * state.wallSpeedScale;
  if (fragmentCount === 0) speed = -6;

  for (const wall of state.walls) {
    if (wall.side === 'left') {
      wall.edgeX = Math.min(Math.max(wall.edgeX + speed * SIM.fixedDt, WALL_INITIAL_LEFT), WALL_MAX_LEFT);
    } else {
      wall.edgeX = Math.max(Math.min(wall.edgeX - speed * SIM.fixedDt, WALL_INITIAL_RIGHT), WALL_MIN_RIGHT);
    }
  }

  // 挤压伤害：只在墙主动推进（speed > 0）时结算，避免出生点被静止墙磨血
  if (speed > 0 && state.wallDamageCooldown === 0) {
    const player = state.player;
    if (player.locomotion !== 'dead' && player.invulnFrames === 0) {
      const top = groundTop(state);
      for (const wall of state.walls) {
        const rect =
          wall.side === 'left'
            ? { x: wall.edgeX - wall.width, y: top - wall.height, w: wall.width, h: wall.height }
            : { x: wall.edgeX, y: top - wall.height, w: wall.width, h: wall.height };
        if (overlap(rect, player.hurtbox)) {
          player.health = Math.max(0, player.health - WALL_DAMAGE);
          player.hurtFrames = SIM.hurtStunFrames;
          player.invulnFrames = SIM.invulnFrames;
          player.flashFrames = SIM.flashFrames;
          player.locomotion = 'hurt';
          state.wallDamageCooldown = WALL_DAMAGE_INTERVAL;
          state.shakeFrames = SIM.shakeFrames;
          break;
        }
      }
    }
  }
}

function updateSweepWaves(state: GameState): void {
  const player = state.player;
  for (const wave of state.hazards) {
    if (!wave.alive) continue;
    wave.x += wave.dir * wave.speed * SIM.fixedDt;
    if (wave.x < 0 || wave.x > state.worldWidth) {
      wave.alive = false;
      continue;
    }
    // 站在地面必吃；跳上高台（hurtbox 底高于波顶）可躲
    if (
      !wave.hitApplied &&
      player.invulnFrames === 0 &&
      player.locomotion !== 'dead'
    ) {
      const rect = {
        x: wave.x - SWEEP_HALF_WIDTH,
        y: wave.y - wave.height,
        w: SWEEP_HALF_WIDTH * 2,
        h: wave.height,
      };
      if (overlap(rect, player.hurtbox)) {
        wave.hitApplied = true;
        player.health = Math.max(0, player.health - wave.damage);
        player.hurtFrames = SIM.hurtStunFrames;
        player.invulnFrames = SIM.invulnFrames;
        player.flashFrames = SIM.flashFrames;
        player.locomotion = 'hurt';
        state.shakeFrames = SIM.shakeFrames;
      }
    }
  }
  state.hazards = state.hazards.filter((wave) => wave.alive);
}

/** 场上存活碎片超过上限时，从最旧的开始回收 */
function enforceFragmentCap(state: GameState): void {
  const alive = state.fragments
    .filter((f) => f.alive)
    .sort((a, b) => a.id - b.id);
  for (let i = 0; i + state.fragmentCap < alive.length; i++) {
    alive[i]!.alive = false;
  }
}

/** P3 冲撞循环：蓄力 40 帧 → 冲撞 600px/s → 撞墙硬直 120 帧 → 召唤 → 循环 */
function updateBossCharge(boss: EnemyState, state: GameState): void {
  if (boss.chargePhase === 'none') {
    boss.chargePhase = 'windup';
    boss.chargeFramesLeft = CHARGE_WINDUP_FRAMES;
  }

  if (boss.chargePhase === 'windup') {
    // 蓄力：面向玩家，不动（地面预示线由渲染层读 chargePhase 画）
    boss.facing = state.player.position.x < boss.position.x ? -1 : 1;
    boss.velocity.x = 0;
    boss.chargeFramesLeft -= 1;
    if (boss.chargeFramesLeft <= 0) {
      boss.chargePhase = 'charge';
      boss.chargeDistanceLeft = CHARGE_MAX_DISTANCE;
    }
    return;
  }

  if (boss.chargePhase === 'charge') {
    boss.velocity.x = boss.facing * CHARGE_SPEED;
    boss.chargeDistanceLeft -= Math.abs(boss.velocity.x) * SIM.fixedDt;
    // 撞场地边界（support 半宽钳制）或跑满 1200px → 硬直
    const half = boss.width / 2;
    const minX = boss.support.x + half;
    const maxX = boss.support.x + boss.support.w - half;
    const nextX = boss.position.x + boss.velocity.x * SIM.fixedDt;
    if (nextX <= minX || nextX >= maxX || boss.chargeDistanceLeft <= 0) {
      boss.velocity.x = 0;
      boss.chargePhase = 'stun';
      boss.chargeFramesLeft = CHARGE_STUN_FRAMES;
      boss.vulnerableFrames = CHARGE_STUN_FRAMES;
    }
    return;
  }

  // stun：撞墙硬直。hurtFrames 不由它写（Boss 不该被硬直打断），受伤倍率在 applyProjectileHit 读 vulnerableFrames
  boss.velocity.x = 0;
  boss.chargeFramesLeft -= 1;
  if (boss.vulnerableFrames > 0) {
    boss.vulnerableFrames -= 1;
  }
  if (boss.chargeFramesLeft <= 0) {
    summonGlitches(boss, state);
    boss.chargePhase = 'windup';
    boss.chargeFramesLeft = CHARGE_WINDUP_FRAMES;
  }
}

/** 硬直结束后在 Boss 两侧各补一只 runtimeGlitch；存活召唤物上限 4，每次最多补 2 只 */
function summonGlitches(boss: EnemyState, state: GameState): void {
  const aliveSummons = state.enemies.filter(
    (enemy) =>
      enemy.enemyKind === 'runtimeGlitch' &&
      enemy.id.startsWith('summon-') &&
      enemy.health > 0 &&
      enemy.behavior !== 'dead',
  ).length;
  const toSpawn = Math.min(SUMMON_PER_CHARGE, SUMMON_ALIVE_CAP - aliveSummons);
  const minX = boss.support.x + boss.width;
  const maxX = boss.support.x + boss.support.w - boss.width;
  // 召唤物落在主地面上，不跟 Boss 跳台的站位浮动
  const spawnY = groundTop(state);
  for (let i = 0; i < toSpawn; i++) {
    const dir = i === 0 ? -1 : 1;
    const x = Math.min(Math.max(boss.position.x + dir * 120, minX), maxX);
    spawnEnemy(state, 'runtimeGlitch', x, spawnY, { countsTowardExit: false });
  }
}
