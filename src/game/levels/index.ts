import { LEVEL1 } from './level1';
import { LEVEL2 } from './level2';
import { LEVEL3 } from './level3';
import type { LevelConfig } from './types';

/** 关卡顺序。后续关卡只往这个数组末尾追加。 */
export const LEVELS: readonly LevelConfig[] = [LEVEL1, LEVEL2, LEVEL3];

/** 把下标夹到 [0, length-1]，越界时停在第一关或最后一关。 */
export function levelAt(index: number): LevelConfig {
  const clamped = Math.max(0, Math.min(LEVELS.length - 1, index));
  return LEVELS[clamped];
}

/** index 后面是否还有关卡。最后一关返回 false。 */
export function hasNextLevel(index: number): boolean {
  return index + 1 < LEVELS.length;
}
