import { SIM, type PlatformRect } from '../config';
import { OUT_OF_MEMORY_MELEE, type EnemyState } from './EnemyState';
import { type Aabb, syncHurtbox } from './EntityState';
import { circleOverlapsAabb, overlap } from './CollisionSystem';
import type { GameState } from './GameState';
import {
  HEAP_FRAGMENT_SIZE,
  damageFragment,
  spawnHeapFragment,
} from './HeapFragmentSystem';
import type { ProjectileState } from './ProjectileState';

/**
 * 按 kind 配置生成近战判定盒。meleeW <= 0 时返回 null（远程 / Boss 占位）。
 * 像素偏移先 Math.round()，避免亚像素糊边。
 */
export function buildEnemyHitbox(enemy: EnemyState): Aabb | null {
  // syntaxError 第二段用 72×36 / 前伸 46；第一段和其他 kind 仍读实例上的基础盒
  const melee =
    enemy.enemyKind === 'outOfMemoryError'
      ? OUT_OF_MEMORY_MELEE
      : enemy.enemyKind === 'syntaxError' && enemy.comboIndex >= 1
        ? {
            meleeW: enemy.comboMeleeW,
            meleeH: enemy.comboMeleeH,
            meleeForward: enemy.comboMeleeForward,
            meleeOffsetY: enemy.meleeOffsetY,
          }
        : {
            meleeW: enemy.meleeW,
            meleeH: enemy.meleeH,
            meleeForward: enemy.meleeForward,
            meleeOffsetY: enemy.meleeOffsetY,
          };
  // stackOverflowError：overflow 用居中大盒；否则只加宽，高和前伸不变。
  // attackVariant 在进入 startup 时已经定稿，这里不改状态。
  let w = melee.meleeW;
  let h = melee.meleeH;
  let forward = melee.meleeForward;
  if (enemy.enemyKind === 'stackOverflowError') {
    if (enemy.attackVariant === 'overflow') {
      w = enemy.overflowHitboxW;
      h = enemy.overflowHitboxH;
      forward = 0;
    } else {
      w = enemy.meleeW + enemy.stackDepth * enemy.stackHitboxGrowth;
    }
  }
  if (w <= 0) return null;
  const roundedForward = Math.round(forward);
  const cx = enemy.position.x + enemy.facing * roundedForward;
  const cy = enemy.position.y - Math.round(enemy.height * melee.meleeOffsetY);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function syncEnemyAttackHitbox(state: GameState): void {
  for (const enemy of state.enemies) {
    if (enemy.behavior === 'dead' || enemy.attackPhase !== 'active') {
      enemy.hitbox = null;
      continue;
    }
    // meleeW <= 0 的敌人（如 nullPointerException）写 null，不用写死的 64x32 盒
    enemy.hitbox = buildEnemyHitbox(enemy);
  }
  state.player.hitbox = null;
}

/**
 * 结算敌人近战命中。玩家伤害改由弹丸 resolveProjectileHits 处理。
 * 同一次 active 靠 hitApplied 只扣一次血。
 */
export function resolveCombat(state: GameState): void {
  const { player } = state;
  syncHurtbox(player);
  for (const enemy of state.enemies) syncHurtbox(enemy);
  syncEnemyAttackHitbox(state);

  for (const enemy of state.enemies) {
    if (enemy.behavior === 'dead' || enemy.health <= 0) continue;
    if (
      enemy.attackPhase === 'active' &&
      enemy.hitbox !== null &&
      !enemy.hitApplied &&
      player.invulnFrames === 0 &&
      player.locomotion !== 'dead' &&
      overlap(enemy.hitbox, player.hurtbox)
    ) {
      applyEnemyMeleeHit(state, enemy);
    }
  }

  evaluateMatchOutcome(state);
}

function platformAt(
  state: GameState,
  x: number,
  y: number,
  radius: number,
): PlatformRect | null {
  return (
    state.platforms.find(
      (p) =>
        x + radius > p.x &&
        x - radius < p.x + p.w &&
        y + radius > p.y &&
        y - radius < p.y + p.h,
    ) ?? null
  );
}

/** 推进弹丸位移与寿命，再做碰撞结算，最后过滤死亡弹丸 */
export function updateProjectiles(state: GameState, fixedDt: number): void {
  for (const p of state.projectiles) {
    if (!p.alive) continue;
    // heap 抛物线弹受重力；null 弹 gravity 为 0，行为不变
    p.vy += p.gravity * fixedDt;
    const dx = p.vx * fixedDt;
    const dy = p.vy * fixedDt;
    p.x += dx;
    p.y += dy;
    p.travelDistance += Math.hypot(dx, dy);
    p.lifetimeFrames -= 1;

    if (p.lifetimeFrames <= 0 || p.travelDistance >= p.maxDistance) {
      p.alive = false;
      continue;
    }
    const landed = platformAt(state, p.x, p.y, p.radius);
    if (landed) {
      // 只有下落（vy > 0）且标记了的 heap 弹才在落地时生成碎片
      if (p.spawnFragmentOnLand && p.vy > 0) {
        spawnHeapFragment(state, p.x, landed.y);
      }
      p.alive = false;
      continue;
    }
    // 离开场地则移除
    if (
      p.x + p.radius < 0 ||
      p.x - p.radius > state.worldWidth ||
      p.y + p.radius < 0 ||
      p.y - p.radius > state.worldHeight
    ) {
      p.alive = false;
    }
  }

  resolveProjectileHits(state);

  state.projectiles = state.projectiles.filter((p) => p.alive);
}

/**
 * 纯函数式弹丸碰撞结算：只伤害非 owner 目标。
 * 即使弹丸压在玩家 hurtbox 上，ownerId==='player' 时也不扣玩家血。
 * 供 GameLoop 与 verify-sim 直接调用。
 */
export function resolveProjectileHits(state: GameState): void {
  const { player } = state;
  syncHurtbox(player);
  for (const enemy of state.enemies) syncHurtbox(enemy);

  for (const proj of state.projectiles) {
    if (!proj.alive) continue;
    if (proj.ownerId === 'enemy') {
      if (
        player.invulnFrames === 0 &&
        player.locomotion !== 'dead' &&
        circleOverlapsAabb(proj.x, proj.y, proj.radius, player.hurtbox)
      ) {
        applyEnemyShot(state, proj);
      }
      continue;
    }
    // 玩家弹丸先查碎片再查敌人：碎片更小更贴地，先查敌人会让子弹穿过去
    let hitFragment = false;
    for (const fragment of state.fragments) {
      if (!fragment.alive) continue;
      const half = HEAP_FRAGMENT_SIZE / 2;
      if (
        circleOverlapsAabb(proj.x, proj.y, proj.radius, {
          x: fragment.x - half,
          y: fragment.y - half,
          w: HEAP_FRAGMENT_SIZE,
          h: HEAP_FRAGMENT_SIZE,
        })
      ) {
        damageFragment(state, fragment.id, proj.damage);
        proj.alive = false;
        hitFragment = true;
        break;
      }
    }
    if (hitFragment) continue;
    for (const enemy of state.enemies) {
      if (enemy.invulnFrames > 0 || enemy.behavior === 'dead' || enemy.health <= 0) continue;
      if (circleOverlapsAabb(proj.x, proj.y, proj.radius, enemy.hurtbox)) {
        applyProjectileHit(state, proj, enemy);
        break;
      }
    }
  }

  evaluateMatchOutcome(state);
}

export function spawnNullProjectile(state: GameState, enemy: GameState['enemies'][number]): void {
  const facing = enemy.facing;
  state.projectiles.push({
    id: state.nextProjectileId,
    ownerId: 'enemy',
    kind: 'null',
    gravity: 0,
    spawnFragmentOnLand: false,
    x: enemy.position.x + facing * 28,
    y: enemy.position.y - enemy.height * 0.55,
    vx: facing * 180,
    vy: 0,
    radius: 5,
    damage: enemy.damage,
    lifetimeFrames: 70,
    originX: enemy.position.x + facing * 28,
    originY: enemy.position.y - enemy.height * 0.55,
    travelDistance: 0,
    maxDistance: 320,
    alive: true,
  });
  state.nextProjectileId += 1;
}

/**
 * Boss 的抛物线弹：朝 targetX 方向抛出，落地生成内存碎片。
 * vx ±240、vy -380、gravity 900、半径 7、伤害 12、存活 240 帧、最大射程 900。
 */
export function spawnHeapShot(
  state: GameState,
  enemy: GameState['enemies'][number],
  targetX: number,
): void {
  const dir = targetX >= enemy.position.x ? 1 : -1;
  state.projectiles.push({
    id: state.nextProjectileId,
    ownerId: 'enemy',
    kind: 'heap',
    gravity: 900,
    spawnFragmentOnLand: true,
    x: enemy.position.x,
    y: enemy.position.y - enemy.height * 0.55,
    vx: dir * 240,
    vy: -380,
    radius: 7,
    damage: 12,
    lifetimeFrames: 240,
    originX: enemy.position.x,
    originY: enemy.position.y - enemy.height * 0.55,
    travelDistance: 0,
    maxDistance: 900,
    alive: true,
  });
  state.nextProjectileId += 1;
}

function applyEnemyShot(state: GameState, proj: ProjectileState): void {
  const player = state.player;
  player.health = Math.max(0, player.health - proj.damage);
  player.velocity.x = Math.sign(proj.vx) * 160;
  player.velocity.y = SIM.knockbackY;
  player.hurtFrames = SIM.hurtStunFrames;
  player.invulnFrames = SIM.invulnFrames;
  player.flashFrames = SIM.flashFrames;
  player.attackPhase = 'none';
  player.attackFramesLeft = 0;
  player.firedThisShot = false;
  player.locomotion = 'hurt';
  proj.alive = false;
  state.hitStopFrames = SIM.hitStopFrames;
  state.shakeFrames = SIM.shakeFrames;
}

function applyProjectileHit(
  state: GameState,
  proj: ProjectileState,
  victim: GameState['enemies'][number],
): void {
  const attacker = state.player;

  // Boss 的 FATAL 转场期间无敌
  if (victim.enemyKind === 'outOfMemoryError' && victim.fatalFrames > 0) {
    proj.alive = false;
    return;
  }

  // 撞墙硬直（vulnerableFrames > 0）受伤 ×1.8
  const damage = proj.damage * (victim.vulnerableFrames > 0 ? 1.8 : 1);

  victim.health = Math.max(0, victim.health - damage);

  const away =
    Math.sign(victim.position.x - attacker.position.x) || -attacker.facing;
  // 玩家没有 knockbackResist；本函数受害者恒为敌人，直接用实例字段
  victim.velocity.x = away * SIM.knockbackX * (victim.knockbackResist ?? 1);
  victim.velocity.y = SIM.knockbackY;

  victim.hurtFrames = SIM.hurtStunFrames;
  victim.invulnFrames = SIM.invulnFrames;
  victim.flashFrames = SIM.flashFrames;

  // 打断连击：startup / active 期间被弹丸命中则重置段号与突进
  if (victim.attackPhase === 'startup' || victim.attackPhase === 'active') {
    victim.comboIndex = 0;
    victim.dashFramesLeft = 0;
    victim.dashDelayLeft = 0;
  }

  // 只在 startup 打断 stackOverflowError：清层并追加 30 帧硬直。
  // active / recovery 被打不清 stackDepth。必须在 attackPhase 改成 none 之前判断。
  if (
    victim.enemyKind === 'stackOverflowError' &&
    victim.attackPhase === 'startup'
  ) {
    victim.stackDepth = 0;
    victim.attackVariant = 'normal';
    victim.hurtFrames = SIM.hurtStunFrames + 30;
  }

  victim.attackPhase = 'none';
  victim.attackFramesLeft = 0;
  victim.hitbox = null;
  victim.hitApplied = false;
  victim.behavior = 'hurt';

  proj.alive = false;
  state.hitStopFrames = SIM.hitStopFrames;
  state.shakeFrames = SIM.shakeFrames;
}

function applyEnemyMeleeHit(state: GameState, attacker: GameState['enemies'][number]): void {
  const victim = state.player;
  // 第一段扣 damage；syntaxError 第二段扣 comboDamage（14），击退用 comboKnockbackScale
  const secondSlash = attacker.enemyKind === 'syntaxError' && attacker.comboIndex >= 1;
  let damage = secondSlash ? attacker.comboDamage : attacker.damage;
  const scale = secondSlash ? attacker.comboKnockbackScale : 1;
  // stackOverflowError 单独结算：overflow 用固定伤害，否则按当前层数加伤。不改 syntaxError 二连。
  if (attacker.enemyKind === 'stackOverflowError') {
    damage =
      attacker.attackVariant === 'overflow'
        ? attacker.overflowDamage
        : attacker.damage + attacker.stackDepth * attacker.stackDamageGrowth;
  }

  victim.health = Math.max(0, victim.health - damage);

  victim.velocity.x = attacker.facing * SIM.knockbackX * scale;
  victim.velocity.y = SIM.knockbackY;

  victim.hurtFrames = SIM.hurtStunFrames;
  victim.invulnFrames = SIM.invulnFrames;
  victim.flashFrames = SIM.flashFrames;

  // 取消受害者当前攻击
  victim.attackPhase = 'none';
  victim.attackFramesLeft = 0;
  victim.hitbox = null;
  victim.hitApplied = false;
  victim.firedThisShot = false;
  victim.locomotion = 'hurt';

  attacker.hitApplied = true;
  state.hitStopFrames = SIM.hitStopFrames;
  state.shakeFrames = SIM.shakeFrames;
}

function evaluateMatchOutcome(state: GameState): void {
  const { player } = state;
  for (const enemy of state.enemies) {
    if (enemy.health <= 0 && enemy.behavior !== 'dead') {
      enemy.behavior = 'dead';
      enemy.velocity.x = 0;
      enemy.velocity.y = 0;
      enemy.hitbox = null;
      enemy.attackPhase = 'none';
      enemy.attackFramesLeft = 0;
    }
  }
  if (player.health <= 0 && player.locomotion !== 'dead') {
    player.locomotion = 'dead';
    player.velocity.x = 0;
    player.velocity.y = 0;
    player.hitbox = null;
    player.attackPhase = 'none';
    player.attackFramesLeft = 0;
    player.firedThisShot = false;
    state.match = 'defeat';
  }
}

/** 从枪口生成一发玩家弹丸（仅由 GameLoop 在进入 fire 时调用一次） */
export function spawnPlayerProjectile(state: GameState): ProjectileState {
  const { player } = state;
  const facing = player.facing;
  const proj: ProjectileState = {
    id: state.nextProjectileId,
    ownerId: 'player',
    gravity: 0,
    spawnFragmentOnLand: false,
    x: player.position.x + facing * SIM.muzzleForward,
    y: player.position.y - SIM.muzzleUp,
    vx: facing * SIM.projectileSpeed,
    vy: 0,
    radius: SIM.projectileRadius,
    damage: SIM.pistolDamage,
    lifetimeFrames: SIM.projectileLifetimeFrames,
    originX: player.position.x + facing * SIM.muzzleForward,
    originY: player.position.y - SIM.muzzleUp,
    travelDistance: 0,
    maxDistance: SIM.projectileMaxDistance,
    alive: true,
  };
  state.nextProjectileId += 1;
  state.projectiles.push(proj);
  return proj;
}
