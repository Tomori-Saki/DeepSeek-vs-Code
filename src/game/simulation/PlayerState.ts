import { SIM } from '../config';
import {
  type CombatBody,
  type Facing,
  type PlayerAttackPhase,
  type Vec2,
  syncHurtbox,
} from './EntityState';

export type LocomotionState =
  | 'idle'
  | 'run'
  | 'jump'
  | 'fall'
  | 'hurt'
  | 'attack'
  | 'dead';

export interface PlayerState extends Omit<CombatBody, 'attackPhase'> {
  kind: 'player';
  attackPhase: PlayerAttackPhase;
  locomotion: LocomotionState;
  coyoteFrames: number;
  jumpBufferFrames: number;
  /** 收枪后冷却；>0 时不可再进入 startup */
  attackCooldownFrames: number;
  /** 本段开枪是否已生成弹丸，保证 startup→fire 只出 1 发 */
  firedThisShot: boolean;
  /** 减速剩余帧。>0 时水平移速 ×0.55、跳跃初速 ×0.82；递减在 updateGlitchZones。 */
  slowFrames: number;
  /** 下蹲穿台剩余帧；>0 时单向平台不承接 */
  dropThroughFrames: number;
}

export function createPlayer(x: number = SIM.playerSpawnX, y: number = SIM.playerSpawnY): PlayerState {
  const position: Vec2 = { x, y };
  const velocity: Vec2 = { x: 0, y: 0 };
  const facing: Facing = 1;
  const attackPhase: PlayerAttackPhase = 'none';
  const player: PlayerState = {
    kind: 'player',
    id: 'player',
    position,
    velocity,
    facing,
    width: SIM.playerWidth,
    height: SIM.playerHeight,
    grounded: true,
    health: SIM.playerMaxHealth,
    maxHealth: SIM.playerMaxHealth,
    hurtbox: { x: 0, y: 0, w: 0, h: 0 },
    // 玩家不再有近战击打盒
    hitbox: null,
    attackPhase,
    attackFramesLeft: 0,
    hitApplied: false,
    hurtFrames: 0,
    invulnFrames: 0,
    flashFrames: 0,
    locomotion: 'idle',
    coyoteFrames: SIM.coyoteFrames,
    jumpBufferFrames: 0,
    attackCooldownFrames: 0,
    firedThisShot: false,
    slowFrames: 0,
    dropThroughFrames: 0,
  };
  syncHurtbox(player);
  return player;
}
