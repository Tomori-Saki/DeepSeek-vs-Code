/** 平台矩形，x/y 是左上角，单位像素。顶面 y 就是可站立的地面。 */
export interface PlatformRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 固定步长模拟参数。时间用帧计数（60Hz），不要改成动画回调。
 * 人物脚底中心为 position。
 * 敌人/Boss 的战斗数值统一在 EnemyState.KIND 表，别在这里另抄一份。
 */
export const SIM = {
  fixedHz: 60,
  fixedDt: 1 / 60,
  maxFrameDt: 0.1,
  worldWidth: 960,
  worldHeight: 540,
  gravity: 2100,
  maxFallSpeed: 900,
  moveSpeed: 260,
  airControl: 0.65,
  jumpVelocity: -720,
  coyoteFrames: 6,
  jumpBufferFrames: 6,
  playerWidth: 36,
  playerHeight: 78,
  enemyWidth: 40,
  enemyHeight: 72,
  playerMaxHealth: 100,
  hurtStunFrames: 13,
  invulnFrames: 21,
  hitStopFrames: 4,
  knockbackX: 280,
  knockbackY: -160,
  shakeFrames: 8,
  flashFrames: 6,
  playerSpawnX: 280,
  playerSpawnY: 440,
  /** 手枪：抬枪 → 开火 1 帧 → 收枪 → 冷却 */
  pistolStartupFrames: 5,
  pistolFireFrames: 1,
  pistolRecoveryFrames: 10,
  pistolCooldownFrames: 12,
  pistolDamage: 30,
  projectileSpeed: 720,
  projectileRadius: 4,
  projectileLifetimeFrames: 90,
  /** 弹丸飞行超过这个距离就从模拟里删掉，不能站桩清完全关。 */
  projectileMaxDistance: 420,
  muzzleForward: 22,
  muzzleUp: 34,
} as const;

export const VIEW = {
  parentId: 'game-root',
  backgroundColor: '#14182e',
} as const;
