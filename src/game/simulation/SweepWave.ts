/** 横扫波：GC PAUSE 结束时从 Boss 位置向左右各放一道（纯模拟数据） */
export interface SweepWave {
  id: number;
  /** 波前沿中心 x */
  x: number;
  /** 地面顶面 y */
  y: number;
  dir: -1 | 1;
  /** px/s */
  speed: number;
  /** 判定高度，从地面顶面向上 */
  height: number;
  damage: number;
  alive: boolean;
  /** 同一道波只命中玩家一次 */
  hitApplied: boolean;
}
