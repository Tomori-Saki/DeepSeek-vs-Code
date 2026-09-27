import { SIM, type PlatformRect } from '../config';
import { levelAt } from '../levels';
import { platformUnder } from '../levels/level1';
import type { EnemyKind, EnemySpawn, LevelConfig } from '../levels/types';
import {
  type AttackPhase,
  type CombatBody,
  type Facing,
  type Vec2,
  syncHurtbox,
} from './EntityState';
import type { GameState } from './GameState';

/** 地面哨兵的显式行为。attack 仍走三段攻击相位。 */
export type EnemyBehavior =
  | 'patrol'
  | 'alert'
  | 'chase'
  | 'attack'
  | 'hurt'
  | 'dead';

/** 本次近战形态。进入 startup 时定稿，active 中途不改。 */
export type AttackVariant = 'normal' | 'overflow';

export interface EnemyState extends CombatBody {
  kind: 'enemy';
  enemyKind: EnemyKind;
  /** 为 false 时不参与出口解锁。缺省 true。 */
  countsTowardExit: boolean;
  blinkCooldownFrames: number;
  behavior: EnemyBehavior;
  patrolMinX: number;
  patrolMaxX: number;
  alertRange: number;
  attackRange: number;
  patrolSpeed: number;
  chaseSpeed: number;
  damage: number;
  alertFramesLeft: number;
  support: PlatformRect;
  attackStartupFrames: number;
  attackActiveFrames: number;
  attackRecoveryFrames: number;
  attackCooldownMax: number;
  attackCooldownFrames: number;
  /** 当前连击段号，0 = 第一段 */
  comboIndex: number;
  /** 突进剩余帧；>0 时 startup 按 dashSpeed 位移。多于 dashFrames 的部分不位移 */
  dashFramesLeft: number;
  /** 不参与位移。突进前摇放在 dashFramesLeft = dashFrames + 5，本字段保持 0 */
  dashDelayLeft: number;
  /** 突进速度（px/s），从 KIND 表拷贝 */
  dashSpeed: number;
  /** 突进总帧数，从 KIND 表拷贝 */
  dashFrames: number;
  /** 栈层数。普通攻击从 active 转入 recovery 时 +1，上限 stackMax */
  stackDepth: number;
  /** 本次攻击形态。进入 startup 时决定，active 中途不换盒 */
  attackVariant: AttackVariant;
  /** 叠层上限，从 KIND 拷贝。非 stackOverflowError 为 0，逻辑不读取 */
  stackMax: number;
  /** 每层判定盒宽度增量（px） */
  stackHitboxGrowth: number;
  /** 每层伤害增量 */
  stackDamageGrowth: number;
  /** 满层 overflow 判定盒宽；居中，不前伸 */
  overflowHitboxW: number;
  /** 满层 overflow 判定盒高 */
  overflowHitboxH: number;
  /** 满层 overflow 伤害 */
  overflowDamage: number;
  /** 击退抗性系数，1 = 全额吃击退 */
  knockbackResist: number;
  /** 近战判定盒宽；<=0 表示无近战盒 */
  meleeW: number;
  meleeH: number;
  /** 判定盒中心相对身体的水平前伸 */
  meleeForward: number;
  /** 判定盒中心相对身体的高度系数 */
  meleeOffsetY: number;
  /** 连击总段数 */
  comboSegments: number;
  /** 段间 startup 帧数；0 表示复用 attackStartupFrames */
  comboStartupFrames: number;
  /** 第二段击退倍率；第一段结算时仍用 1 */
  comboKnockbackScale: number;
  /** 第二段伤害；0 表示仍用 damage */
  comboDamage: number;
  /** 第二段近战盒宽；0 表示仍用基础近战盒 */
  comboMeleeW: number;
  comboMeleeH: number;
  /** 第二段判定盒中心相对身体的水平前伸 */
  comboMeleeForward: number;
  /** Boss 阶段（仅 outOfMemoryError 使用） */
  bossPhase: 1 | 2 | 3;
  /** GC PAUSE 剩余帧 */
  gcFrames: number;
  /** 距下一次 heapShot 的帧数 */
  heapShotFramesLeft: number;
  /** 撞墙硬直剩余帧；>0 时受伤 ×1.8（S9 用，这里先建字段） */
  vulnerableFrames: number;
  /** P3 冲撞相位（仅 Boss） */
  chargePhase: 'none' | 'windup' | 'charge' | 'stun';
  /** 当前冲撞相位剩余帧 */
  chargeFramesLeft: number;
  /** 冲撞剩余距离（px），跑满 1200 也进硬直 */
  chargeDistanceLeft: number;
  /** FATAL 全屏转场剩余帧；>0 时 Boss 无敌且不动 */
  fatalFrames: number;
  /** Boss 跳台冷却（帧） */
  bossJumpCooldownFrames: number;
}

/** 杂兵与 Boss 数值表。Boss 的逻辑体型用表里的 width/height，不动 SIM。 */
type KindCombatStats = {
  health: number;
  patrolSpeed: number;
  chaseSpeed: number;
  alertRange: number;
  attackRange: number;
  damage: number;
  startup: number;
  active: number;
  recovery: number;
  cooldown: number;
  meleeW: number;
  meleeH: number;
  meleeForward: number;
  meleeOffsetY: number;
  comboSegments: number;
  comboStartupFrames: number;
  dashFrames: number;
  dashSpeed: number;
  /** 第二段击退倍率，第一段不用 */
  comboKnockbackScale: number;
  /** 第二段伤害；0 表示仍用 damage */
  comboDamage: number;
  /** 第二段近战盒；宽为 0 表示仍用基础盒 */
  comboMeleeW: number;
  comboMeleeH: number;
  comboMeleeForward: number;
  /** 逻辑体宽 / 体高；杂兵用 SIM.enemyWidth/Height */
  width: number;
  height: number;
  /** 击退抗性，Boss 0.12 */
  knockbackResist: number;
  /** 叠层上限。只有 stackOverflowError 会读 */
  stackMax: number;
  /** 每层判定盒加宽。其他 kind 为 0 */
  stackHitboxGrowth: number;
  /** 每层伤害加成。其他 kind 为 0 */
  stackDamageGrowth: number;
  /** 满层爆发判定盒宽 */
  overflowHitboxW: number;
  /** 满层爆发判定盒高 */
  overflowHitboxH: number;
  /** 满层爆发伤害 */
  overflowDamage: number;
};

/**
 * 非 stackOverflowError 不走叠层。
 * stackMax 置 0（不用），成长置 0；overflow 尺寸保留表默认，逻辑不读取。
 */
const UNUSED_STACK = {
  stackMax: 0,
  stackHitboxGrowth: 0,
  stackDamageGrowth: 0,
  overflowHitboxW: 150,
  overflowHitboxH: 64,
  overflowDamage: 24,
} as const;

/** 杂兵共用：逻辑体型与击退抗性用 SIM 默认 */
const MINION_BODY = {
  width: SIM.enemyWidth,
  height: SIM.enemyHeight,
  knockbackResist: 1,
} as const;

const KIND: Record<EnemyKind, KindCombatStats> = {
  syntaxError: {
    health: 60,
    patrolSpeed: 55,
    chaseSpeed: 110,
    alertRange: 280,
    attackRange: 52,
    damage: 10,
    startup: 18,
    active: 4,
    recovery: 26,
    cooldown: 80,
    meleeW: 64,
    meleeH: 32,
    meleeForward: 40,
    meleeOffsetY: 0.55,
    comboSegments: 2,
    comboStartupFrames: 6,
    // 突进 11 帧；进入突进时 dashFramesLeft = dashFrames+5，前 5 帧不位移
    dashFrames: 11,
    dashSpeed: 420,
    comboKnockbackScale: 1.4,
    comboDamage: 14,
    comboMeleeW: 72,
    comboMeleeH: 36,
    comboMeleeForward: 46,
    ...MINION_BODY,
    ...UNUSED_STACK,
  },
  nullPointerException: {
    health: 40,
    patrolSpeed: 40,
    chaseSpeed: 70,
    alertRange: 320,
    attackRange: 240,
    damage: 8,
    startup: 16,
    active: 1,
    recovery: 12,
    cooldown: 110,
    meleeW: 0,
    meleeH: 0,
    meleeForward: 0,
    meleeOffsetY: 0.55,
    comboSegments: 1,
    comboStartupFrames: 0,
    dashFrames: 0,
    dashSpeed: 0,
    comboKnockbackScale: 1,
    comboDamage: 0,
    comboMeleeW: 0,
    comboMeleeH: 0,
    comboMeleeForward: 0,
    ...MINION_BODY,
    ...UNUSED_STACK,
  },
  stackOverflowError: {
    health: 84,
    patrolSpeed: 38,
    chaseSpeed: 82,
    alertRange: 220,
    attackRange: 56,
    damage: 16,
    startup: 18,
    active: 4,
    recovery: 24,
    cooldown: 84,
    meleeW: 64,
    meleeH: 32,
    meleeForward: 40,
    meleeOffsetY: 0.55,
    comboSegments: 1,
    comboStartupFrames: 0,
    dashFrames: 0,
    dashSpeed: 0,
    comboKnockbackScale: 1,
    comboDamage: 0,
    comboMeleeW: 0,
    comboMeleeH: 0,
    comboMeleeForward: 0,
    stackMax: 4,
    stackHitboxGrowth: 12,
    stackDamageGrowth: 4,
    overflowHitboxW: 150,
    overflowHitboxH: 64,
    overflowDamage: 24,
    ...MINION_BODY,
  },
  runtimeGlitch: {
    health: 40,
    patrolSpeed: 70,
    chaseSpeed: 130,
    alertRange: 220,
    attackRange: 0,
    // 瞬移后的闪现斩：startup 8 / active 4 / recovery 18，伤害 8
    damage: 8,
    startup: 8,
    active: 4,
    recovery: 18,
    cooldown: 96,
    meleeW: 56,
    meleeH: 32,
    meleeForward: 34,
    meleeOffsetY: 0.55,
    comboSegments: 1,
    comboStartupFrames: 0,
    dashFrames: 0,
    dashSpeed: 0,
    comboKnockbackScale: 1,
    comboDamage: 0,
    comboMeleeW: 0,
    comboMeleeH: 0,
    comboMeleeForward: 0,
    ...MINION_BODY,
    ...UNUSED_STACK,
  },
  // Boss：outOfMemoryError。战斗循环在 BossSystem，不走 updateOne。
  outOfMemoryError: {
    health: 600,
    patrolSpeed: 40,
    chaseSpeed: 40,
    alertRange: 9999,
    attackRange: 0,
    damage: 0,
    startup: 0,
    active: 0,
    recovery: 0,
    // cooldown 复用为 heapShot 间隔：P1 150 帧，P2 后由 BossSystem 改成 110
    cooldown: 150,
    meleeW: 0,
    meleeH: 0,
    meleeForward: 0,
    meleeOffsetY: 0.55,
    comboSegments: 1,
    comboStartupFrames: 0,
    dashFrames: 0,
    dashSpeed: 0,
    comboKnockbackScale: 1,
    comboDamage: 0,
    comboMeleeW: 0,
    comboMeleeH: 0,
    comboMeleeForward: 0,
    width: 96,
    height: 120,
    knockbackResist: 0.12,
    ...UNUSED_STACK,
  },
};

/**
 * Boss 近战盒占位：零近战，供 buildEnemyHitbox 读到。
 * Boss 行为在 BossSystem，不进 updateOne。
 */
export const OUT_OF_MEMORY_MELEE = {
  meleeW: 0,
  meleeH: 0,
  meleeForward: 0,
  meleeOffsetY: 0.55,
} as const;

export function createSentinel(spawn: EnemySpawn, level: LevelConfig): EnemyState {
  const stats = KIND[spawn.enemyKind];
  const position: Vec2 = { x: spawn.x, y: spawn.y };
  const enemy: EnemyState = {
    kind: 'enemy',
    enemyKind: spawn.enemyKind,
    countsTowardExit: spawn.countsTowardExit ?? true,
    blinkCooldownFrames: 0,
    id: spawn.id,
    position,
    velocity: { x: 0, y: 0 },
    facing: spawn.facing,
    width: stats.width,
    height: stats.height,
    grounded: true,
    health: stats.health,
    maxHealth: stats.health,
    hurtbox: { x: 0, y: 0, w: 0, h: 0 },
    hitbox: null,
    attackPhase: 'none',
    attackFramesLeft: 0,
    hitApplied: false,
    hurtFrames: 0,
    invulnFrames: 0,
    flashFrames: 0,
    behavior: 'patrol',
    attackCooldownFrames: 0,
    patrolMinX: spawn.patrolMinX,
    patrolMaxX: spawn.patrolMaxX,
    alertRange: stats.alertRange,
    attackRange: stats.attackRange,
    patrolSpeed: stats.patrolSpeed,
    chaseSpeed: stats.chaseSpeed,
    damage: stats.damage,
    alertFramesLeft: 0,
    support: { ...platformUnder(level, spawn.x, spawn.y) },
    attackStartupFrames: stats.startup,
    attackActiveFrames: stats.active,
    attackRecoveryFrames: stats.recovery,
    attackCooldownMax: stats.cooldown,
    comboIndex: 0,
    dashFramesLeft: 0,
    dashDelayLeft: 0,
    dashSpeed: stats.dashSpeed,
    dashFrames: stats.dashFrames,
    stackDepth: 0,
    attackVariant: 'normal',
    stackMax: stats.stackMax,
    stackHitboxGrowth: stats.stackHitboxGrowth,
    stackDamageGrowth: stats.stackDamageGrowth,
    overflowHitboxW: stats.overflowHitboxW,
    overflowHitboxH: stats.overflowHitboxH,
    overflowDamage: stats.overflowDamage,
    knockbackResist: stats.knockbackResist,
    meleeW: stats.meleeW,
    meleeH: stats.meleeH,
    meleeForward: stats.meleeForward,
    meleeOffsetY: stats.meleeOffsetY,
    comboSegments: stats.comboSegments,
    comboStartupFrames: stats.comboStartupFrames,
    comboKnockbackScale: stats.comboKnockbackScale,
    comboDamage: stats.comboDamage,
    comboMeleeW: stats.comboMeleeW,
    comboMeleeH: stats.comboMeleeH,
    comboMeleeForward: stats.comboMeleeForward,
    bossPhase: 1,
    gcFrames: 0,
    heapShotFramesLeft: 0,
    vulnerableFrames: 0,
    chargePhase: 'none',
    chargeFramesLeft: 0,
    chargeDistanceLeft: 0,
    fatalFrames: 0,
    bossJumpCooldownFrames: 0,
  };
  syncHurtbox(enemy);
  return enemy;
}

export function createLevelEnemies(level: LevelConfig): EnemyState[] {
  return level.enemies.map((spawn) => createSentinel(spawn, level));
}

/**
 * 运行时生成敌人（Boss 召唤）。id 必须唯一：EnemyView 按 id 建/销精灵。
 * countsTowardExit 缺省 false——召唤物不挡出口，否则 Boss 一直补怪出口永远开不了。
 * 出生点找不到支撑平台说明关卡数据写错了，直接 throw，不要静默兜底。
 */
export function spawnEnemy(
  state: GameState,
  kind: EnemyKind,
  x: number,
  y: number,
  options?: { countsTowardExit?: boolean; patrolRadius?: number; idPrefix?: string },
): EnemyState {
  const level = levelAt(state.levelIndex);
  const radius = options?.patrolRadius ?? 60;
  const spawn: EnemySpawn = {
    id: `${options?.idPrefix ?? 'summon'}-${state.nextEnemyId}`,
    x,
    y,
    facing: -1,
    patrolMinX: x - radius,
    patrolMaxX: x + radius,
    enemyKind: kind,
    countsTowardExit: options?.countsTowardExit ?? false,
  };
  state.nextEnemyId += 1;
  const enemy = createSentinel(spawn, level);
  state.enemies.push(enemy);
  return enemy;
}

/** 兼容旧调用：返回列表中的第一名敌人。 */
export function primaryEnemy(enemies: readonly EnemyState[]): EnemyState {
  return enemies[0];
}

export type { AttackPhase, Facing };
