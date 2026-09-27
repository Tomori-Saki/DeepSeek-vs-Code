import type { PlatformRect } from '../config';

export type EnemyKind =
  | 'syntaxError'
  | 'nullPointerException'
  | 'stackOverflowError'
  | 'runtimeGlitch'
  | 'outOfMemoryError';

export interface EnemySpawn {
  id: string;
  x: number;
  y: number;
  facing: -1 | 1;
  patrolMinX: number;
  patrolMaxX: number;
  enemyKind: EnemyKind;
  /** 缺省 true。false 表示这只敌人不参与出口解锁判定。 */
  countsTowardExit?: boolean;
}

/** 出口矩形，x/y 为左上角。 */
export interface ExitRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LevelConfig {
  id: string;
  /** 转场大字用的显示名，例如 'SYNTAX ERROR' */
  displayName: string;
  worldWidth: number;
  worldHeight: number;
  fallDeathY: number;
  playerSpawnX: number;
  playerSpawnY: number;
  platforms: readonly PlatformRect[];
  enemies: readonly EnemySpawn[];
  exit: ExitRect;
}
