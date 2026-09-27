/** 玩家手枪弹丸（纯模拟数据，不依赖渲染） */
export interface ProjectileState {
  id: number;
  ownerId: 'player' | 'enemy';
  /** 视图标记：'null' 文字弹丸；'heap' Boss 抛物线弹 */
  kind?: 'null' | 'heap';
  /** 重力加速度 px/s²；'null' 弹为 0（直线），'heap' 弹为 900 */
  gravity: number;
  /** 落地后是否生成内存碎片 */
  spawnFragmentOnLand: boolean;
  maxDistance: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  lifetimeFrames: number;
  originX: number;
  originY: number;
  travelDistance: number;
  alive: boolean;
}
