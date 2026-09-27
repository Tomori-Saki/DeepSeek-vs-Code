import type { EnemyKind } from '../levels/types';

export interface EnemyVisualSpec {
  /** 悬停高度（渲染层偏移，负数=往上抬） */
  hoverY: number;
  /** idle 呼吸振幅（整数像素） */
  bobAmplitude: number;
  /** idle 呼吸周期（模拟帧） */
  bobPeriod: number;
  /** 落地阴影宽（像素）与透明度 */
  shadowWidth: number;
  shadowAlpha: number;
  /** 贴图实际可见宽度，用来算阴影和形变，不用帧宽 64 */
  visibleWidth: number;
  visibleHeight: number;
  /** 目标显示高度。四类杂兵 = 64，Boss = 128 */
  displayHeight: number;
}

export const ENEMY_VISUAL: Record<EnemyKind, EnemyVisualSpec> = {
  syntaxError: {
    hoverY: 0,
    bobAmplitude: 1,
    bobPeriod: 48,
    shadowWidth: 40,
    shadowAlpha: 0.42,
    visibleWidth: 56,
    visibleHeight: 47,
    displayHeight: 64,
  },
  nullPointerException: {
    hoverY: -8,
    bobAmplitude: 2,
    bobPeriod: 32,
    shadowWidth: 20,
    shadowAlpha: 0.22,
    visibleWidth: 50,
    visibleHeight: 48,
    displayHeight: 64,
  },
  stackOverflowError: {
    hoverY: 0,
    bobAmplitude: 1,
    bobPeriod: 64,
    shadowWidth: 27,
    shadowAlpha: 0.42,
    visibleWidth: 37,
    visibleHeight: 48,
    displayHeight: 64,
  },
  runtimeGlitch: {
    hoverY: 0,
    bobAmplitude: 2,
    bobPeriod: 24,
    shadowWidth: 40,
    shadowAlpha: 0.42,
    visibleWidth: 56,
    visibleHeight: 48,
    displayHeight: 64,
  },
  // Boss：显示高 128，阴影更宽。缺图由 PreloadScene 兜底。
  outOfMemoryError: {
    hoverY: 0,
    bobAmplitude: 2,
    bobPeriod: 90,
    shadowWidth: 72,
    shadowAlpha: 0.42,
    visibleWidth: 96,
    visibleHeight: 120,
    displayHeight: 128,
  },
};

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** 用敌人 id 求一个稳定相位，避免同屏多个同类敌人整齐划一地上下动。 */
export function enemyPhase(id: string, period: number): number {
  let hash = 7;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % 9973;
  }
  return hash % period;
}

/** idle 呼吸：返回整数像素偏移。 */
export function enemyBob(frame: number, phase: number, spec: EnemyVisualSpec): number {
  return Math.round(
    Math.sin(((frame + phase) / spec.bobPeriod) * Math.PI * 2) * spec.bobAmplitude,
  );
}

export interface Squash {
  offsetX: number;
  scaleX: number;
  scaleY: number;
}

/**
 * 攻击形变。phase 取 'none' | 'startup' | 'active' | 'recovery'。
 * offsetX 已乘 facing，recovery 段再取整。
 */
export function enemyAttackSquash(
  phase: string,
  framesLeft: number,
  recoveryFrames: number,
  facing: -1 | 1,
): Squash {
  if (phase === 'startup') {
    return { offsetX: 3 * facing, scaleX: 0.92, scaleY: 1.06 };
  }
  if (phase === 'active') {
    return { offsetX: 5 * facing, scaleX: 1.08, scaleY: 0.94 };
  }
  if (phase === 'recovery') {
    const t = 1 - clamp(framesLeft / Math.max(1, recoveryFrames), 0, 1);
    return {
      offsetX: Math.round(5 * facing * (1 - t)),
      scaleX: 1.08 + (1 - 1.08) * t,
      scaleY: 0.94 + (1 - 0.94) * t,
    };
  }
  return { offsetX: 0, scaleX: 1, scaleY: 1 };
}

/** 出生缩入：elapsed 是「第一次看到这个敌人」之后的帧数。 */
export function enemySpawnTransform(elapsed: number): { alpha: number; scale: number } {
  const t = clamp(elapsed / 12, 0, 1);
  return { alpha: t, scale: 0.65 + 0.35 * t };
}

/** 叠层的体型倍率。非 stackOverflowError 恒返回 1。 */
export function enemyStackScale(kind: EnemyKind, stackDepth: number): number {
  if (kind !== 'stackOverflowError') {
    return 1;
  }
  return 1 + 0.06 * clamp(stackDepth, 0, 4);
}

/**
 * 头顶层数方块：返回 4 个 {dx, dy, filled}，未叠的只是描边框。
 * 非 stackOverflowError 返回空数组。
 * dx/dy 是 6×6 方块中心相对脚底的偏移：横排、相邻边缘间距 8px、整排水平居中。
 */
export function enemyStackPips(
  kind: EnemyKind,
  stackDepth: number,
  spec: EnemyVisualSpec,
): { dx: number; dy: number; filled: boolean }[] {
  if (kind !== 'stackOverflowError') {
    return [];
  }
  const count = 4;
  const size = 6;
  const gap = 8;
  const pitch = size + gap;
  const totalWidth = count * size + (count - 1) * gap;
  const firstCenter = -totalWidth / 2 + size / 2;
  const dy = Math.round(-spec.visibleHeight - 8);
  const pips: { dx: number; dy: number; filled: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    pips.push({
      dx: Math.round(firstCenter + i * pitch),
      dy,
      filled: i < stackDepth,
    });
  }
  return pips;
}

/** 死亡消散：elapsed 是进入 dead 之后的帧数。 */
export function enemyDeathTransform(elapsed: number): {
  tintFillWhite: boolean;
  visible: boolean;
  alpha: number;
  scaleX: number;
  scaleY: number;
  liftY: number;
} {
  if (elapsed <= 8) {
    return {
      tintFillWhite: true,
      visible: true,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      liftY: 0,
    };
  }
  if (elapsed >= 21) {
    return {
      tintFillWhite: false,
      visible: false,
      alpha: 0,
      scaleX: 1,
      scaleY: 1,
      liftY: 0,
    };
  }
  const t = (elapsed - 9) / 11;
  return {
    tintFillWhite: false,
    visible: true,
    alpha: 1 - t,
    scaleX: 1 + 0.35 * t,
    scaleY: 1 - 0.55 * t,
    liftY: -Math.round(5 * t),
  };
}
