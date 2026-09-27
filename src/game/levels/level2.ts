import type { PlatformRect } from '../config';
import type { EnemySpawn, LevelConfig } from './types';

/**
 * 第二关：三组编队考试。
 * A 组教故障场（安全台免疫）、B 组教打断（窄门）、C 组是控制 + 远程组合。
 * 坐标已按可跳性核过：地面起跳最多 123px，平台间隙 ≤ 100px。
 */
export const LEVEL2 = {
  id: 'level2' as const,
  // 文档未给第二关显示名；按错误主题取 'RUNTIME GLITCH'（本关教故障场）
  displayName: 'RUNTIME GLITCH',
  worldWidth: 2800,
  worldHeight: 560,
  fallDeathY: 540,
  playerSpawnX: 120,
  playerSpawnY: 440,
  platforms: [
    // 地面四段，坑宽 50 / 60 / 80，都是第一关学过的档位
    { id: 'l2-ground-a', x: 40, y: 440, w: 760, h: 80 },
    { id: 'l2-ground-b', x: 850, y: 440, w: 620, h: 80 },
    { id: 'l2-ground-c', x: 1530, y: 440, w: 700, h: 80 },
    { id: 'l2-ground-d', x: 2310, y: 440, w: 450, h: 80 },

    // 教学高台与跨坑高路
    { id: 'l2-mid-1', x: 300, y: 340, w: 180, h: 16 },
    { id: 'l2-mid-2', x: 540, y: 320, w: 160, h: 16 },
    // 高路平台抬高到 280：地面起跳够不到，必须经中间台二级跳
    { id: 'l2-high-1', x: 760, y: 280, w: 240, h: 16 },
    // A 组安全台：高出地面 110px，站上后故障场判定不成立
    { id: 'l2-a-safe', x: 1000, y: 330, w: 150, h: 16 },
    { id: 'l2-mid-3', x: 1180, y: 340, w: 200, h: 16 },
    { id: 'l2-high-2', x: 1450, y: 280, w: 200, h: 16 },
    // B 组窄门：130px 宽，叠层的 stackOverflowError 独占
    { id: 'l2-gate', x: 1700, y: 340, w: 130, h: 16 },
    { id: 'l2-mid-4', x: 1900, y: 330, w: 170, h: 16 },
    { id: 'l2-high-3', x: 2090, y: 280, w: 220, h: 16 },
    { id: 'l2-mid-5', x: 2380, y: 340, w: 180, h: 16 },
    { id: 'l2-exit-ledge', x: 2590, y: 330, w: 150, h: 16 },
  ] satisfies readonly PlatformRect[],
  enemies: [
    // A 组：教故障场。地面两只 runtimeGlitch 铺场，高台一只远程
    { id: 'l2-a-glitch-1', x: 950, y: 440, facing: -1, patrolMinX: 880, patrolMaxX: 1060, enemyKind: 'runtimeGlitch' },
    { id: 'l2-a-glitch-2', x: 1180, y: 440, facing: -1, patrolMinX: 1080, patrolMaxX: 1300, enemyKind: 'runtimeGlitch' },
    { id: 'l2-a-null-1', x: 1280, y: 340, facing: -1, patrolMinX: 1200, patrolMaxX: 1360, enemyKind: 'nullPointerException' },
    // B 组：教打断。窄门上的 stackOverflowError 叠层后玩家站不上去
    { id: 'l2-b-syn-1', x: 1620, y: 440, facing: -1, patrolMinX: 1560, patrolMaxX: 1700, enemyKind: 'syntaxError' },
    { id: 'l2-b-stack', x: 1765, y: 340, facing: -1, patrolMinX: 1730, patrolMaxX: 1800, enemyKind: 'stackOverflowError' },
    { id: 'l2-b-syn-2', x: 2000, y: 440, facing: -1, patrolMinX: 1950, patrolMaxX: 2150, enemyKind: 'syntaxError' },
    // C 组：控制 + 远程组合考试。地面故障场逼走高路，高路上两只远程压制
    { id: 'l2-c-null-1', x: 2160, y: 280, facing: -1, patrolMinX: 2120, patrolMaxX: 2280, enemyKind: 'nullPointerException' },
    { id: 'l2-c-glitch-1', x: 2150, y: 440, facing: -1, patrolMinX: 2060, patrolMaxX: 2230, enemyKind: 'runtimeGlitch' },
    { id: 'l2-c-glitch-2', x: 2380, y: 440, facing: -1, patrolMinX: 2330, patrolMaxX: 2480, enemyKind: 'runtimeGlitch' },
    { id: 'l2-c-null-2', x: 2470, y: 340, facing: -1, patrolMinX: 2420, patrolMaxX: 2540, enemyKind: 'nullPointerException' },
  ] satisfies readonly EnemySpawn[],
  exit: { id: 'l2-exit', x: 2700, y: 362, w: 48, h: 78 },
} satisfies LevelConfig;
