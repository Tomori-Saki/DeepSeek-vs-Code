/** 故障场：runtimeGlitch 瞬移落点留下的减速区域（纯模拟数据） */
export interface GlitchZone {
  id: number;
  /** 圆心 x（生成时的旧位置） */
  x: number;
  /** 贴地 y，取生成时敌人的脚底 y */
  y: number;
  /** 判定半径 */
  radius: number;
  /** 剩余存在帧数 */
  framesLeft: number;
}
