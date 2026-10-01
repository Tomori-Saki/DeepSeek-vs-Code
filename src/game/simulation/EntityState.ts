import { SIM } from '../config';

/** 面向：-1 左，1 右 */
export type Facing = -1 | 1;

export interface Vec2 {
  x: number;
  y: number;
}

/** 世界坐标左上角的轴对齐包围盒（AABB） */
export interface Aabb {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 敌人近战三段：startup / active / recovery */
export type AttackPhase = 'none' | 'startup' | 'active' | 'recovery';

/** 玩家手枪显式阶段：用 fire 表示开枪帧，不再用 active */
export type PlayerAttackPhase = 'none' | 'startup' | 'fire' | 'recovery';

/** 可参与碰撞与战斗的实体公共字段 */
export interface CombatBody {
  id: string;
  position: Vec2;
  velocity: Vec2;
  facing: Facing;
  width: number;
  height: number;
  grounded: boolean;
  health: number;
  maxHealth: number;
  hurtbox: Aabb;
  hitbox: Aabb | null;
  /** 敌人用 AttackPhase；玩家用 PlayerAttackPhase（见 PlayerState） */
  attackPhase: AttackPhase | PlayerAttackPhase;
  attackFramesLeft: number;
  /** 本段 active 是否已结算过伤害，避免同窗多段扣血（敌人近战） */
  hitApplied: boolean;
  hurtFrames: number;
  invulnFrames: number;
  flashFrames: number;
}

/** 脚底中心 → 受伤盒（左上角 AABB） */
export function syncHurtbox(body: CombatBody): void {
  body.hurtbox = {
    x: body.position.x - body.width / 2,
    y: body.position.y - body.height,
    w: body.width,
    h: body.height,
  };
}

/** 玩家/杂兵/Boss 共用的重力累积，封顶 maxFallSpeed */
export function applyGravity(body: { velocity: { y: number } }): void {
  body.velocity.y += SIM.gravity * SIM.fixedDt;
  if (body.velocity.y > SIM.maxFallSpeed) body.velocity.y = SIM.maxFallSpeed;
}
