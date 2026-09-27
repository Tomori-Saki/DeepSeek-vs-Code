/** 内存墙：Boss P1 从两侧挤压的墙体（纯模拟数据） */
export interface AllocWall {
  side: 'left' | 'right';
  /** 内边缘的世界 x：left 墙 = 右边缘，right 墙 = 左边缘 */
  edgeX: number;
  /** 墙厚 */
  width: number;
  /** 墙高 */
  height: number;
}
