import type { PlatformRect } from '../config';
import type { EnemySpawn, ExitRect, LevelConfig } from './types';

/**
 * 横向第四关，世界宽 3600，视口 960。
 * 顶面只使用三档高度：440（地面）/ 340（中层）/ 260（高层），
 * 全部跳跃衔接都在实测范围内（单跳最高 123px；升 100px 时水平最多错位 85px，
 * 升 80px 时约 90px，升 180px 只能靠 340 中转）。
 * 六段流程：地形骨架 → 入口教学 → 第一组战斗 → 组合战斗 → 出口前缓冲 → 出口。
 */
export const LEVEL4 = {
  id: 'level4',
  displayName: 'SEGMENTATION FAULT',
  worldWidth: 3600,
  worldHeight: 560,
  fallDeathY: 540,
  playerSpawnX: 120,
  playerSpawnY: 440,
  platforms: [
    // ① 地形骨架：地面四段 + 三个 1 格（80px）坑，坑宽统一便于读图，落地节奏一致。
    { id: 'l4-ground-a', x: 0, y: 440, w: 960, h: 80 },
    { id: 'l4-ground-b', x: 1040, y: 440, w: 960, h: 80 },
    { id: 'l4-ground-c', x: 2080, y: 440, w: 880, h: 80 },
    { id: 'l4-ground-d', x: 3040, y: 440, w: 560, h: 80 },

    // ② 入口教学区：两段跳演示。先 440→340 直跳（升 100）上中层，
    // 再由中层 340→260（升 80，水平错位 80 ≤ 90）接高台，让玩家一次学会二段节奏。
    { id: 'l4-mid-1', x: 400, y: 340, w: 200, h: 16 },
    { id: 'l4-high-1', x: 680, y: 260, w: 160, h: 16 },

    // ③ 第一组战斗：双掩体交替。两块 340 掩体被 80px 空隙分开，
    // 掩体既挡横向子弹又能当台阶；远程敌人 N 架在掩体顶上，
    // 地面直线打不到它，玩家必须跳上掩体才能命中。
    { id: 'l4-cover-1', x: 1120, y: 340, w: 240, h: 16 },
    { id: 'l4-cover-2', x: 1440, y: 340, w: 240, h: 16 },
    // 高台远程压制位：由 cover-2（340）升 80 直跳可达，N/P 类敌人蹲点逼玩家上高。
    { id: 'l4-high-2', x: 1760, y: 260, w: 200, h: 16 },

    // ④ 组合战斗：窄台 + 高台远程压制。
    // l4-narrow 只有 1 格宽（80），站上去风险高但能换取高度；
    // 从 narrow（260）落到 mid-3（340）安全，反向则由 mid-3 升 80 跳上，
    // high-3 再以升 80 接续，形成「窄台—高台」交替的立体压制火力。
    { id: 'l4-mid-2', x: 2120, y: 340, w: 200, h: 16 },
    { id: 'l4-narrow', x: 2360, y: 260, w: 80, h: 16 },
    { id: 'l4-mid-3', x: 2540, y: 340, w: 200, h: 16 },
    { id: 'l4-high-3', x: 2780, y: 260, w: 160, h: 16 },

    // ⑤ 出口前缓冲区与 ⑥ 出口：ground-d 作为第三个坑后的落脚缓冲，
    // 无敌人、无高台，给玩家回血与重新站稳的喘息空间，末端即出口门。
  ] satisfies readonly PlatformRect[],
  enemies: [
    // ② 入口教学区：地面哨兵在 ground-a 上巡逻，作为第一次交火练习。
    { id: 'l4-e-s1', x: 520, y: 440, facing: -1, patrolMinX: 480, patrolMaxX: 700, enemyKind: 'syntaxError' },
    // ③ 第一组战斗：N 架在 l4-cover-1 上（顶面 y=340），地面够不到，必须跳上掩体才能打到；
    // R 埋在坑前落脚点附近（ground-b 靠坑一侧），玩家刚过坑就要处理近身威胁。
    { id: 'l4-e-n1', x: 1250, y: 340, facing: -1, patrolMinX: 1160, patrolMaxX: 1320, enemyKind: 'nullPointerException' },
    { id: 'l4-e-r1', x: 1850, y: 440, facing: -1, patrolMinX: 1780, patrolMaxX: 1980, enemyKind: 'runtimeGlitch' },
    // ④ 组合战斗：O 只站在 1 格窄台上做定点压制；N 蹲守 high-3 高台远程封锁；
    // S 在 mid-3 中层巡逻，与上层敌人形成上下夹击。
    { id: 'l4-e-o1', x: 2400, y: 260, facing: -1, patrolMinX: 2380, patrolMaxX: 2420, enemyKind: 'stackOverflowError' },
    { id: 'l4-e-n2', x: 2860, y: 260, facing: -1, patrolMinX: 2800, patrolMaxX: 2920, enemyKind: 'nullPointerException' },
    { id: 'l4-e-s2', x: 2600, y: 340, facing: -1, patrolMinX: 2560, patrolMaxX: 2720, enemyKind: 'syntaxError' },
    // 入口教学：高台远程，逼玩家学会跳上高台攻击
    { id: 'l4-e-n3', x: 760, y: 260, facing: -1, patrolMinX: 700, patrolMaxX: 820, enemyKind: 'nullPointerException' },
    // 第一组战斗：第二掩体近战 + 高台远程 + 地面突进怪
    { id: 'l4-e-s3', x: 1560, y: 340, facing: -1, patrolMinX: 1460, patrolMaxX: 1660, enemyKind: 'syntaxError' },
    { id: 'l4-e-n4', x: 1860, y: 260, facing: -1, patrolMinX: 1780, patrolMaxX: 1940, enemyKind: 'nullPointerException' },
    { id: 'l4-e-r2', x: 1380, y: 440, facing: -1, patrolMinX: 1300, patrolMaxX: 1500, enemyKind: 'runtimeGlitch' },
    // 组合战斗：中层近战 + 地面突进怪
    { id: 'l4-e-s4', x: 2200, y: 340, facing: -1, patrolMinX: 2140, patrolMaxX: 2300, enemyKind: 'syntaxError' },
    { id: 'l4-e-r3', x: 2500, y: 440, facing: -1, patrolMinX: 2440, patrolMaxX: 2640, enemyKind: 'runtimeGlitch' },
    // 出口前缓冲：最后一只巡逻守卫
    { id: 'l4-e-s5', x: 3250, y: 440, facing: -1, patrolMinX: 3120, patrolMaxX: 3420, enemyKind: 'syntaxError' },
  ] satisfies readonly EnemySpawn[],
  // ⑥ 出口：站在 ground-d（440）地面上，门脚贴地。
  exit: { id: 'l4-exit', x: 3480, y: 362, w: 48, h: 78 } satisfies ExitRect,
} satisfies LevelConfig;