/** 内存碎片：heapShot 落地后生成，可被玩家弹丸打掉（纯模拟数据） */
export interface HeapFragment {
  id: number;
  /** 中心 x */
  x: number;
  /** 中心 y；落地时定为平台顶面 - 10，让 20×20 方块贴地 */
  y: number;
  health: number;
  framesLeft: number;
  alive: boolean;
  /** 受击闪白剩余帧（渲染层只读） */
  hurtFrames: number;
}
