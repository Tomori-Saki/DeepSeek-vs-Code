import type { PlatformRect } from '../config';
import type { EnemyKind, EnemySpawn, ExitRect, LevelConfig } from './types';

export type { EnemyKind, EnemySpawn, ExitRect };

/**
 * 横向第一关，世界宽 2600，视口 960。
 * 分区：教学 → 第一战斗 → 高低分流 → 第二战斗 → 出口冲刺。
 * 低路更直接但需要读坑，高路更安全但要连续跳上悬空平台。
 */
export const LEVEL1 = {
  id: 'level1' as const,
  displayName: 'SYNTAX ERROR',
  worldWidth: 2600,
  worldHeight: 560,
  fallDeathY: 540,
  playerSpawnX: 120,
  playerSpawnY: 440,
  platforms: [
    // 教学区 40–400：出生、侧向实体块、一次可读的低台跳跃。
    { id: 'ground-tutorial', x: 40, y: 440, w: 360, h: 80 },
    { id: 'side-block', x: 46, y: 392, w: 40, h: 48 },
    { id: 'teach-low', x: 178, y: 330, w: 126, h: 16 },

    // 第一深坑 400–450：短坑，作为第一次跳跃节奏提示，留出足够落点宽度。
    { id: 'ground-combat1', x: 450, y: 440, w: 490, h: 80 },
    { id: 'fight1-cover', x: 590, y: 340, w: 150, h: 16 },
    // 高掩体抬高到 300：地面起跳够不到（140 > 123），必须先踩 fight1-cover 二级跳
    { id: 'fight1-cover-high', x: 792, y: 300, w: 112, h: 16 },

    // 高低分流区：低路在 1000–1140 之间断开，高路用一条长平台跨越。
    { id: 'ground-low-route', x: 940, y: 440, w: 180, h: 80 },
    { id: 'upper-route-one', x: 866, y: 330, w: 246, h: 16 },
    // 抬高到 284：从 upper-route-one（330）二级跳上去，地面直上不够
    { id: 'upper-route-two', x: 1086, y: 284, w: 286, h: 16 },
    { id: 'ground-combat2', x: 1140, y: 440, w: 430, h: 80 },
    { id: 'fight2-step', x: 1260, y: 340, w: 152, h: 16 },

    // 第二深坑 1570–1610：短而突然，要求在战斗后提前读地形；之后提供可选高台。
    { id: 'upper-route-three', x: 1740, y: 330, w: 204, h: 16 },
    { id: 'ground-buffer', x: 1610, y: 440, w: 400, h: 80 },

    // 出口冲刺区：短缓冲、第三个不同宽度的坑和终端门。
    { id: 'exit-buffer', x: 2010, y: 440, w: 180, h: 80 },
    { id: 'ground-exit', x: 2270, y: 440, w: 290, h: 80 },
  ] satisfies readonly PlatformRect[],
  enemies: [
    // 第一战斗区：两个地面哨兵被掩体分开，便于练习远程攻击。
    { id: 'sentinel-a', x: 620, y: 440, facing: -1, patrolMinX: 540, patrolMaxX: 720, enemyKind: 'syntaxError' },
    { id: 'sentinel-b', x: 660, y: 340, facing: -1, patrolMinX: 610, patrolMaxX: 720, enemyKind: 'nullPointerException' },
    // 分流汇合处：哨兵守住低路出口，高路可以绕开它但需要连续跳跃。
    { id: 'sentinel-c', x: 1010, y: 440, facing: -1, patrolMinX: 950, patrolMaxX: 1100, enemyKind: 'stackOverflowError' },
    // 第二战斗区：地面与台阶混合，巡逻范围明显不同。
    { id: 'sentinel-d', x: 1320, y: 440, facing: -1, patrolMinX: 1200, patrolMaxX: 1480, enemyKind: 'runtimeGlitch' },
    { id: 'sentinel-e', x: 840, y: 300, facing: 1, patrolMinX: 810, patrolMaxX: 880, enemyKind: 'nullPointerException' },
    // 第二深坑之后：两个巡逻范围不同的哨兵组成缓冲战斗。
    { id: 'sentinel-f', x: 1780, y: 440, facing: 1, patrolMinX: 1740, patrolMaxX: 1870, enemyKind: 'runtimeGlitch' },
    { id: 'sentinel-g', x: 1930, y: 440, facing: -1, patrolMinX: 1850, patrolMaxX: 1990, enemyKind: 'syntaxError' },
  ] satisfies readonly EnemySpawn[],
  exit: { id: 'exit', x: 2480, y: 362, w: 48, h: 78 } satisfies ExitRect,
} satisfies LevelConfig;

export function platformUnder(level: LevelConfig, x: number, feetY: number): PlatformRect {
  const found = level.platforms.find(
    (p) => feetY === p.y && x >= p.x && x <= p.x + p.w,
  );
  if (!found) {
    throw new Error(`出生点没有落在平台上: ${x}, ${feetY}`);
  }
  return found;
}
