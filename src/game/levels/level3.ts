import type { PlatformRect } from '../config';
import type { LevelConfig } from './types';

/**
 * Boss 房：outOfMemoryError。
 * 不设深坑，难度来自内存墙挤压。两侧高台（y=330）用来躲 GC 横扫波，
 * 中场两块浮台（y=360）用来躲 heapShot 抛物线和 P3 冲撞。
 * 文档里出口 x=1880 落在 l3-ground（200+1600=1800）之外；
 * 这里把地面加长到 w=1700（覆盖到 1900），出口放在 x=1852——
 * 右墙初始位置是 [1800, 1848]，门再靠左就会被墙挤伤。
 * 出生点 x=260：文档的 180 在地面（x 从 200 开始）之外，进去就掉坑。
 */
export const LEVEL3 = {
  id: 'level3' as const,
  displayName: 'OUT OF MEMORY',
  worldWidth: 2000,
  worldHeight: 560,
  fallDeathY: 540,
  playerSpawnX: 260,
  playerSpawnY: 440,
  platforms: [
    { id: 'l3-ground', x: 200, y: 440, w: 1700, h: 80 },
    { id: 'l3-ledge-left', x: 120, y: 330, w: 200, h: 16 },
    { id: 'l3-ledge-right', x: 1680, y: 330, w: 200, h: 16 },
    // 中场浮台：躲抛物线弹与冲撞的上避点位
    { id: 'l3-mid-left', x: 400, y: 360, w: 120, h: 16 },
    { id: 'l3-mid-right', x: 1480, y: 360, w: 120, h: 16 },
  ] satisfies readonly PlatformRect[],
  enemies: [
    { id: 'l3-boss', x: 1000, y: 440, facing: -1, patrolMinX: 700, patrolMaxX: 1300, enemyKind: 'outOfMemoryError' },
  ],
  exit: { id: 'l3-exit', x: 1852, y: 362, w: 48, h: 78 },
} satisfies LevelConfig;
