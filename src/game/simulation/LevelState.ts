import type { LevelConfig } from '../levels/types';

/** 可重置的关卡进度。几何仍来自关卡数据，这里只记开关。 */
export interface LevelState {
  id: string;
  exitUnlocked: boolean;
}

export function createLevelState(level: LevelConfig): LevelState {
  return { id: level.id, exitUnlocked: false };
}
