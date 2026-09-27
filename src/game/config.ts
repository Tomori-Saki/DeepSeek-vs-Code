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
  enemyMaxHealth: 90,
  playerDamage: 30,
  enemyDamage: 20,
  attackStartupFrames: 5,
  attackActiveFrames: 4,
  attackRecoveryFrames: 12,
  enemyAttackStartupFrames: 18,
  enemyAttackActiveFrames: 6,
  enemyAttackRecoveryFrames: 22,
  enemyAttackRange: 86,
  enemyAttackCooldownFrames: 96,
  hurtStunFrames: 13,
  invulnFrames: 21,
  hitStopFrames: 4,
  knockbackX: 280,
  knockbackY: -160,
  shakeFrames: 8,
  flashFrames: 6,
  playerSpawnX: 280,
  playerSpawnY: 440,
  enemySpawnX: 680,
  enemySpawnY: 440,
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
  projectileMaxDistance: 560,
  muzzleForward: 22,
  muzzleUp: 34,
} as const;

export const PLATFORMS: readonly PlatformRect[] = [
  { id: 'ground', x: 40, y: 440, w: 880, h: 64 },
  { id: 'ledge-left', x: 90, y: 330, w: 150, h: 22 },
  { id: 'ledge-right', x: 720, y: 330, w: 150, h: 22 },
];

export const VIEW = {
  parentId: 'game-root',
  backgroundColor: '#14182e',
} as const;
