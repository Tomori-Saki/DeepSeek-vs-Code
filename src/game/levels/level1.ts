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
    // 地面六段，坑宽 40 / 60 / 80，全部 ≤ 90 可一跳而过。
    { id: 'ground-tutorial', x: 0, y: 440, w: 420, h: 80 },
    { id: 'ground-combat1', x: 460, y: 440, w: 480, h: 80 },
    { id: 'ground-low-route', x: 1000, y: 440, w: 240, h: 80 },
    { id: 'ground-combat2', x: 1320, y: 440, w: 480, h: 80 },
    { id: 'ground-buffer', x: 1880, y: 440, w: 180, h: 80 },
    { id: 'ground-exit', x: 2120, y: 440, w: 480, h: 80 },

    // 入口教学区：贴地实心块（顶面 340）教撞墙，teach-low 教一次直跳上 340。
    { id: 'side-block', x: 46, y: 340, w: 40, h: 100 },
    { id: 'teach-low', x: 200, y: 340, w: 160, h: 16 },

    // 第一组战斗：掩体 340 + 高掩体 260。地面直上高掩体要跨 180px（超过单跳上限 123px），
    // 必须先踩 fight1-cover 再二段跳，落差 80px、水平错位 60px。
    { id: 'fight1-cover', x: 560, y: 340, w: 200, h: 16 },
    { id: 'fight1-cover-high', x: 820, y: 260, w: 160, h: 16 },

    // 高低分流：低路地面 + 高路两段（340 → 260，落差 80、错位 80）。
    { id: 'upper-route-one', x: 1020, y: 340, w: 220, h: 16 },
    { id: 'upper-route-two', x: 1320, y: 260, w: 240, h: 16 },

    // 第二战斗台阶 + 爬升接力台：fight2-mid 落在 upper-route-two 正下方，
    // 第二战斗区从地面原地两跳就能上 260，260 狙击位不至于只能靠上一区的
    // upper-route-one 绕远接力。
    { id: 'fight2-mid', x: 1320, y: 340, w: 240, h: 16 },

    // 第二战斗台阶 + 出口前高台。
    { id: 'fight2-step', x: 1620, y: 340, w: 180, h: 16 },
    { id: 'upper-route-three', x: 1880, y: 340, w: 200, h: 16 },
  ] satisfies readonly PlatformRect[],
  enemies: [
    // 第一战斗区：地面哨兵守掩体，掩体顶上再架一只远程，逼玩家跳上去打。
    { id: 'sentinel-a', x: 640, y: 440, facing: -1, patrolMinX: 520, patrolMaxX: 880, enemyKind: 'syntaxError' },
    { id: 'sentinel-b', x: 680, y: 340, facing: -1, patrolMinX: 620, patrolMaxX: 740, enemyKind: 'nullPointerException' },
    // 分流汇合处：叠层怪守住低路出口，高路可以绕开但要连续跳。
    { id: 'sentinel-c', x: 1080, y: 440, facing: -1, patrolMinX: 1020, patrolMaxX: 1220, enemyKind: 'stackOverflowError' },
    // 第二战斗区：地面与高路混合，巡逻范围明显不同。
    { id: 'sentinel-d', x: 1500, y: 440, facing: -1, patrolMinX: 1380, patrolMaxX: 1740, enemyKind: 'runtimeGlitch' },
    { id: 'sentinel-e', x: 1400, y: 260, facing: -1, patrolMinX: 1340, patrolMaxX: 1540, enemyKind: 'nullPointerException' },
    // 出口前缓冲区：两只巡逻范围不同的哨兵。
    { id: 'sentinel-f', x: 1930, y: 440, facing: 1, patrolMinX: 1900, patrolMaxX: 2000, enemyKind: 'runtimeGlitch' },
    { id: 'sentinel-g', x: 2030, y: 440, facing: -1, patrolMinX: 1990, patrolMaxX: 2040, enemyKind: 'syntaxError' },
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
