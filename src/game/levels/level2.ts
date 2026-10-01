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
    // 地面四段，坑宽统一 80px（一格），落地节奏一致。
    { id: 'l2-ground-a', x: 0, y: 440, w: 700, h: 80 },
    { id: 'l2-ground-b', x: 780, y: 440, w: 720, h: 80 },
    { id: 'l2-ground-c', x: 1580, y: 440, w: 680, h: 80 },
    { id: 'l2-ground-d', x: 2340, y: 440, w: 460, h: 80 },

    // 入口教学：先一级跳上 340，再由 340 二段跳上 260（地面直上 260 要跨 180px，超过单跳上限）。
    { id: 'l2-mid-1', x: 280, y: 340, w: 160, h: 16 },
    { id: 'l2-mid-2', x: 520, y: 340, w: 180, h: 16 },
    { id: 'l2-high-1', x: 780, y: 260, w: 220, h: 16 },

    // A 组：安全台高出地面 100px，站上去故障场判定不成立；右侧留接力台。
    { id: 'l2-a-safe', x: 1060, y: 340, w: 160, h: 16 },
    { id: 'l2-mid-3', x: 1300, y: 340, w: 200, h: 16 },
    { id: 'l2-high-2', x: 1580, y: 260, w: 200, h: 16 },

    // B 组：130px 窄门，叠层怪独占。
    { id: 'l2-gate', x: 1880, y: 340, w: 130, h: 16 },

    // C 组：控制 + 远程组合，中台 → 高台接力，末端出口小台。
    { id: 'l2-mid-4', x: 2060, y: 340, w: 180, h: 16 },
    { id: 'l2-high-3', x: 2300, y: 260, w: 200, h: 16 },
    { id: 'l2-mid-5', x: 2460, y: 340, w: 140, h: 16 },
    { id: 'l2-exit-ledge', x: 2620, y: 340, w: 140, h: 16 },
  ] satisfies readonly PlatformRect[],
  enemies: [
    // 教学区：踏上第一块 340 中台后的近战遭遇
    { id: 'l2-t-syn-1', x: 340, y: 340, facing: -1, patrolMinX: 300, patrolMaxX: 420, enemyKind: 'syntaxError' },
    // A 组：地面两只故障场铺场，高台两只远程压制
    { id: 'l2-a-glitch-1', x: 520, y: 440, facing: -1, patrolMinX: 380, patrolMaxX: 680, enemyKind: 'runtimeGlitch' },
    { id: 'l2-a-glitch-2', x: 980, y: 440, facing: -1, patrolMinX: 900, patrolMaxX: 1120, enemyKind: 'runtimeGlitch' },
    { id: 'l2-a-null-2', x: 880, y: 260, facing: -1, patrolMinX: 800, patrolMaxX: 980, enemyKind: 'nullPointerException' },
    { id: 'l2-a-null-1', x: 1400, y: 340, facing: -1, patrolMinX: 1320, patrolMaxX: 1480, enemyKind: 'nullPointerException' },
    // B 组：窄门打断，地面两只近战 + 门上叠层怪 + 门后远程
    { id: 'l2-b-syn-1', x: 1250, y: 440, facing: -1, patrolMinX: 1150, patrolMaxX: 1420, enemyKind: 'syntaxError' },
    { id: 'l2-b-stack', x: 1940, y: 340, facing: -1, patrolMinX: 1900, patrolMaxX: 1990, enemyKind: 'stackOverflowError' },
    { id: 'l2-b-syn-2', x: 1700, y: 440, facing: -1, patrolMinX: 1620, patrolMaxX: 1920, enemyKind: 'syntaxError' },
    { id: 'l2-b-null-3', x: 2150, y: 340, facing: -1, patrolMinX: 2080, patrolMaxX: 2220, enemyKind: 'nullPointerException' },
    // C 组：控制 + 远程组合
    { id: 'l2-c-null-1', x: 1680, y: 260, facing: -1, patrolMinX: 1600, patrolMaxX: 1760, enemyKind: 'nullPointerException' },
    { id: 'l2-c-glitch-1', x: 1900, y: 440, facing: -1, patrolMinX: 1820, patrolMaxX: 2100, enemyKind: 'runtimeGlitch' },
    { id: 'l2-c-glitch-2', x: 2420, y: 440, facing: -1, patrolMinX: 2360, patrolMaxX: 2560, enemyKind: 'runtimeGlitch' },
    { id: 'l2-c-null-2', x: 2540, y: 340, facing: -1, patrolMinX: 2480, patrolMaxX: 2580, enemyKind: 'nullPointerException' },
    { id: 'l2-c-syn-3', x: 2680, y: 440, facing: -1, patrolMinX: 2620, patrolMaxX: 2780, enemyKind: 'syntaxError' },
  ] satisfies readonly EnemySpawn[],
  exit: { id: 'l2-exit', x: 2700, y: 362, w: 48, h: 78 },
} satisfies LevelConfig;
