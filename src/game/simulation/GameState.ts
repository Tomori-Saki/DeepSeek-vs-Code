import { type PlatformRect } from '../config';
import { LEVELS, levelAt } from '../levels';
import type { ExitRect } from '../levels/types';
import { createLevelEnemies, type EnemyState } from './EnemyState';
import { createLevelState, type LevelState } from './LevelState';
import { createPlayer, type PlayerState } from './PlayerState';
import type { AllocWall } from './AllocWall';
import type { GlitchZone } from './GlitchZone';
import type { HeapFragment } from './HeapFragment';
import type { ProjectileState } from './ProjectileState';
import type { SweepWave } from './SweepWave';

export type MatchState =
  | 'playing'
  | 'paused'
  | 'transitioning'
  | 'victory'
  | 'defeat'
  | 'levelCleared';

export interface GameState {
  match: MatchState;
  frame: number;
  debug: boolean;
  /** 当前关卡在 LEVELS 中的下标 */
  levelIndex: number;
  /** levelCleared 后的倒计时，到 0 才考虑进入转场 */
  clearFrames: number;
  /** transitioning 倒计时，到 0 载入下一关 */
  transitionFrames: number;
  /** 运行时生成敌人的 id 计数器，单调递增 */
  nextEnemyId: number;
  hitStopFrames: number;
  shakeFrames: number;
  player: PlayerState;
  enemies: EnemyState[];
  level: LevelState;
  exit: ExitRect;
  worldWidth: number;
  worldHeight: number;
  fallDeathY: number;
  platforms: PlatformRect[];
  projectiles: ProjectileState[];
  /** 下一发弹丸 id，单调递增 */
  nextProjectileId: number;
  /** 场上的故障场（runtimeGlitch 瞬移落点生成） */
  glitchZones: GlitchZone[];
  /** 下一个故障场 id，单调递增 */
  nextZoneId: number;
  /** 场上的内存碎片（heapShot 落地生成） */
  fragments: HeapFragment[];
  /** 下一块碎片 id，单调递增 */
  nextFragmentId: number;
  /** Boss 内存墙（左右各一堵） */
  walls: AllocWall[];
  /** 墙挤压伤害的节流计数，每 60 帧最多扣一次 */
  wallDamageCooldown: number;
  /** GC PAUSE 结束后墙回到初始位置的剩余帧数 */
  wallReturnFrames: number;
  /** 墙推速倍率，P2 后 ×1.5 */
  wallSpeedScale: number;
  /** 场上碎片上限，P2 后 +2 */
  fragmentCap: number;
  /** 横扫波（GC PAUSE 释放） */
  hazards: SweepWave[];
  /** 下一道波 id，单调递增 */
  nextHazardId: number;
}

/** 清空所有本局临时产生、重开或换关都要抹掉的东西。后续阶段新增的环境实体都在这里加一行。 */
function resetTransient(state: GameState): void {
  state.projectiles = [];
  state.nextProjectileId = 1;
  state.glitchZones = [];
  state.nextZoneId = 1;
  state.fragments = [];
  state.nextFragmentId = 1;
  state.walls = [];
  state.wallDamageCooldown = 0;
  state.wallReturnFrames = 0;
  state.wallSpeedScale = 1;
  state.fragmentCap = 4;
  state.hazards = [];
  state.nextHazardId = 1;
}

/** 与 levelAt 同一套夹取，保证指针永远落在已有关卡上。 */
function clampLevelIndex(index: number): number {
  return Math.max(0, Math.min(LEVELS.length - 1, index));
}

function mountLevel(state: GameState, index: number): void {
  const clamped = clampLevelIndex(index);
  const level = levelAt(clamped);
  state.levelIndex = clamped;
  state.player = createPlayer(level.playerSpawnX, level.playerSpawnY);
  state.enemies = createLevelEnemies(level);
  state.level = createLevelState(level);
  state.exit = { ...level.exit };
  state.worldWidth = level.worldWidth;
  state.worldHeight = level.worldHeight;
  state.fallDeathY = level.fallDeathY;
  state.platforms = level.platforms.map((platform) => ({ ...platform }));
}

/**
 * 换到指定关卡（越界则夹到第一关或最后一关）。
 * 重建平台、敌人、出口、世界尺寸和玩家出生点，并清空本局临时物。
 */
export function loadLevel(state: GameState, index: number): void {
  mountLevel(state, index);
  resetTransient(state);
  state.match = 'playing';
  state.clearFrames = 0;
  state.transitionFrames = 0;
}

export function createInitialState(): GameState {
  const state: GameState = {
    match: 'playing',
    frame: 0,
    debug: false,
    levelIndex: 0,
    clearFrames: 0,
    transitionFrames: 0,
    nextEnemyId: 1,
    hitStopFrames: 0,
    shakeFrames: 0,
    player: createPlayer(),
    enemies: [],
    level: { id: '', exitUnlocked: false },
    exit: { id: '', x: 0, y: 0, w: 0, h: 0 },
    worldWidth: 0,
    worldHeight: 0,
    fallDeathY: 0,
    platforms: [],
    projectiles: [],
    nextProjectileId: 1,
    glitchZones: [],
    nextZoneId: 1,
    fragments: [],
    nextFragmentId: 1,
    walls: [],
    wallDamageCooldown: 0,
    wallReturnFrames: 0,
    wallSpeedScale: 1,
    fragmentCap: 4,
    hazards: [],
    nextHazardId: 1,
  };
  loadLevel(state, 0);
  return state;
}

/** 就地重开当前关；levelIndex 与 debug 保持不变。 */
export function resetGameState(state: GameState): void {
  const keepDebug = state.debug;
  const keepIndex = state.levelIndex;
  state.frame = 0;
  state.hitStopFrames = 0;
  state.shakeFrames = 0;
  state.nextEnemyId = 1;
  loadLevel(state, keepIndex);
  state.debug = keepDebug;
}
