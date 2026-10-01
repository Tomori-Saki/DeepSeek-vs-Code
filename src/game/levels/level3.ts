import type { PlatformRect } from '../config';
import type { EnemySpawn, ExitRect, LevelConfig } from './types';

/**
 * 横向第三关，世界宽 3360，视口 960。显示名 STACK OVERFLOW。
 * 分区：入口教学 → 第一组战斗 → 新机制展示 → 组合战斗 → 出口前缓冲 → 出口。
 * 平台顶面只用三档：440（地面）/ 340（中层）/ 260（高层）。
 * 关键高度关系：440→340 差 100 可直跳；340→260 差 80 可直跳；
 * 而 440→260 差 180px 超过了单跳上限（123px），必须经 340 中层中转才能登上高层。
 */
export const LEVEL3 = {
  id: 'level3' as const,
  displayName: 'STACK OVERFLOW',
  worldWidth: 3360,
  worldHeight: 560,
  fallDeathY: 540,
  playerSpawnX: 120,
  playerSpawnY: 440,
  platforms: [
    // 地面四段（h=80, y=440），三段坑宽均为 80px（1 格）。
    { id: 'l3-ground-a', x: 0, y: 440, w: 880, h: 80 },
    { id: 'l3-ground-b', x: 960, y: 440, w: 880, h: 80 },
    { id: 'l3-ground-c', x: 1920, y: 440, w: 880, h: 80 },
    { id: 'l3-ground-d', x: 2880, y: 440, w: 480, h: 80 },

    // 入口教学区：地面 → 中层 → 高层 的两段跳演示。
    // 高层顶面 260 与地面 440 相差 180px，无法一步直上，必须先踩中层（340）再起跳。
    { id: 'l3-t-mid-1', x: 320, y: 340, w: 160, h: 16 },
    { id: 'l3-t-high-1', x: 520, y: 260, w: 160, h: 16 },

    // 第一组战斗：掩体 + 需要跳上去的高台。
    // 高台顶面 260，同样要从掩体顶面 340 二次起跳才够得着。
    { id: 'l3-f1-cover', x: 1040, y: 340, w: 240, h: 16 },
    { id: 'l3-f1-high', x: 1360, y: 260, w: 160, h: 16 },

    // 新机制展示区：垂直高差门（实心块挡住地面直行，顶面 340 可跳上去）。
    // 门顶 340 与地面 440 差 100，可直接跳上；门后的中/高层保留 340→260 的两段跳节奏。
    { id: 'l3-gate', x: 1960, y: 340, w: 80, h: 80 },
    { id: 'l3-m-mid-2', x: 2160, y: 340, w: 200, h: 16 },
    { id: 'l3-m-high-2', x: 2400, y: 260, w: 200, h: 16 },

    // 组合战斗：中层台阶 + 高层窄台，逼迫玩家在战斗中穿插两段跳。
    { id: 'l3-f2-step', x: 2480, y: 340, w: 160, h: 16 },
    { id: 'l3-f2-narrow', x: 2680, y: 260, w: 80, h: 16 },
  ] satisfies readonly PlatformRect[],
  enemies: [
    // 第一组战斗：地面哨兵在掩体前巡逻，高台上的哨兵需要二次跳才能接触到。
    { id: 'l3-e-s1', x: 1020, y: 440, facing: -1, patrolMinX: 980, patrolMaxX: 1200, enemyKind: 'syntaxError' },
    { id: 'l3-e-n1', x: 1420, y: 260, facing: -1, patrolMinX: 1380, patrolMaxX: 1500, enemyKind: 'nullPointerException' },
    // 新机制展示区：地面哨兵在门后巡逻，检验玩家翻门后的落地节奏。
    { id: 'l3-e-r1', x: 2160, y: 440, facing: -1, patrolMinX: 2080, patrolMaxX: 2300, enemyKind: 'runtimeGlitch' },
    // 组合战斗：高层窄台上的重装哨兵，配合中层台阶上的哨兵形成上下夹击。
    { id: 'l3-e-o1', x: 2700, y: 260, facing: -1, patrolMinX: 2700, patrolMaxX: 2740, enemyKind: 'stackOverflowError' },
    { id: 'l3-e-s2', x: 2560, y: 340, facing: -1, patrolMinX: 2500, patrolMaxX: 2620, enemyKind: 'syntaxError' },
    // 教学区地面：入口的第一次遭遇
    { id: 'l3-e-t1', x: 200, y: 440, facing: -1, patrolMinX: 160, patrolMaxX: 300, enemyKind: 'syntaxError' },
    // 第一组战斗：掩体近战 + 地面突进 + 高台叠层怪，形成立体掩护压制
    { id: 'l3-e-s3', x: 1200, y: 340, facing: -1, patrolMinX: 1060, patrolMaxX: 1260, enemyKind: 'syntaxError' },
    { id: 'l3-e-r2', x: 1240, y: 440, facing: -1, patrolMinX: 1180, patrolMaxX: 1380, enemyKind: 'runtimeGlitch' },
    { id: 'l3-e-o2', x: 1480, y: 260, facing: -1, patrolMinX: 1400, patrolMaxX: 1500, enemyKind: 'stackOverflowError' },
    // 新机制展示区：中层近战 + 高层远程
    { id: 'l3-e-s4', x: 2260, y: 340, facing: -1, patrolMinX: 2180, patrolMaxX: 2340, enemyKind: 'syntaxError' },
    { id: 'l3-e-n2', x: 2480, y: 260, facing: -1, patrolMinX: 2440, patrolMaxX: 2560, enemyKind: 'nullPointerException' },
    // 组合战斗：地面突进怪补位，配合上下层敌人夹击
    { id: 'l3-e-r3', x: 2620, y: 440, facing: -1, patrolMinX: 2560, patrolMaxX: 2760, enemyKind: 'runtimeGlitch' },
    // 出口前缓冲：最后一只巡逻守卫
    { id: 'l3-e-s5', x: 3080, y: 440, facing: -1, patrolMinX: 2960, patrolMaxX: 3200, enemyKind: 'syntaxError' },
  ] satisfies readonly EnemySpawn[],
  // 出口前缓冲区：第四段地面（2880–3360）留出最后一段安全跑动距离。
  // 出口：贴第四段地面右端，底边与地面顶面 440 对齐（362 + 78 = 440）。
  exit: { id: 'l3-exit', x: 3240, y: 362, w: 48, h: 78 } satisfies ExitRect,
} satisfies LevelConfig;