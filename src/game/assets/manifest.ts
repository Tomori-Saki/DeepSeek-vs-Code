import type { EnemyKind } from '../levels/types';

/**
 * 素材清单（asset manifest）。
 *
 * 玩法与渲染只依赖稳定的 key（如 player-idle、kenney-ground），
 * 不要在业务代码里写死磁盘路径。
 *
 * 运行时只加载 public/assets 下的 spritesheet（精灵表）；
 * generated/pixel64 等目录是源帧，不要被游戏加载。
 *
 * 角色图缺失时 Preload 会生成占位图（hurt/dead 故意不打表，走占位兜底）。
 *
 * frameWidth/frameHeight 有值时按 spritesheet 切帧；省略则整图一帧。
 */

/**
 * 统一拼资源 URL：public/assets 下的相对路径。
 * dev 时 BASE_URL='/'，构建后 base:'./'，子目录部署不再 404。
 */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}assets/${path}`;
}

export interface AnimSource {
  key: string
  url: string
  frameCount: number
  frameRate: number
  repeat: number
  /** True when the state intentionally uses the generated fallback texture. */
  placeholderOnly?: boolean
  frameWidth?: number
  frameHeight?: number
}

/** 玩家动画：idle/run 循环；攻击/受击/死亡播一次 */
export const PLAYER_ANIMS: readonly AnimSource[] = [
  {
    key: 'player-idle',
    url: assetUrl('characters/player/idle.png'),
    frameCount: 1,
    frameWidth: 64,
    frameHeight: 64,
    frameRate: 8,
    repeat: -1,
  },
  {
    key: 'player-run',
    url: assetUrl('characters/player/run.png'),
    frameCount: 4,
    frameWidth: 64,
    frameHeight: 64,
    frameRate: 10,
    repeat: -1,
  },
  {
    key: 'player-jump',
    url: assetUrl('characters/player/jump.png'),
    frameCount: 4,
    frameWidth: 64,
    frameHeight: 64,
    frameRate: 8,
    repeat: 0,
  },
  {
    key: 'player-fall',
    url: assetUrl('characters/player/jump.png'),
    frameCount: 4,
    frameWidth: 64,
    frameHeight: 64,
    frameRate: 8,
    repeat: 0,
  },
  {
    key: 'player-hurt',
    url: assetUrl('characters/player/hurt.png'),
    frameCount: 1,
    frameRate: 8,
    repeat: 0,
    placeholderOnly: true,
  },
  {
    key: 'player-attack',
    url: assetUrl('characters/player/attack.png'),
    frameCount: 4,
    frameWidth: 64,
    frameHeight: 64,
    frameRate: 12,
    repeat: 0,
  },
  {
    key: 'player-dead',
    url: assetUrl('characters/player/dead.png'),
    frameCount: 1,
    frameRate: 8,
    repeat: 0,
    placeholderOnly: true,
  },
] as const

/** 四类报错敌人：每类一张 64×64 单帧贴图，底部对齐。Boss 额外有 P3 内核贴图。 */
export const ENEMY_KIND_SPRITES: Record<
  EnemyKind,
  { key: string; url: string; coreKey?: string; coreUrl?: string }
> = {
  syntaxError: {
    key: 'enemy-syntax-error',
    url: assetUrl('characters/enemy/syntax-error.png'),
  },
  nullPointerException: {
    key: 'enemy-null-pointer',
    url: assetUrl('characters/enemy/null-pointer.png'),
  },
  stackOverflowError: {
    key: 'enemy-stack-overflow',
    url: assetUrl('characters/enemy/stack-overflow.png'),
  },
  runtimeGlitch: {
    key: 'enemy-runtime-glitch',
    url: assetUrl('characters/enemy/runtime-glitch.png'),
  },
  // Boss 与 P3 内核。缺图由 PreloadScene 兜底生成大块占位。
  outOfMemoryError: {
    key: 'enemy-oom',
    url: assetUrl('characters/enemy/out-of-memory.png'),
    coreKey: 'enemy-oom-core',
    coreUrl: assetUrl('characters/enemy/out-of-memory-core.png'),
  },
};

/** 缺图时占位块的颜色，按 kind 区分，保证兜底也能一眼看出是哪一类。 */
export const ENEMY_PLACEHOLDER_COLORS: Record<EnemyKind, number> = {
  syntaxError: 0xd9442e,
  nullPointerException: 0x8fe3ff,
  stackOverflowError: 0xa878e8,
  runtimeGlitch: 0x5ede7a,
  outOfMemoryError: 0x2ecc71,
};

/** Kenney 地面瓦片（单块，非整张 Sample 图） */
export const KENNEY_GROUND_KEY = 'kenney-ground'
export const KENNEY_GROUND_URL = assetUrl('environment/kenney/ground.png')

/** Kenney 背景瓦片（单块，非整张 Sample 图） */
export const KENNEY_BG_KEY = 'kenney-bg'
export const KENNEY_BG_URL = assetUrl('environment/kenney/bg.png')

/** 玩家手枪弹丸（白色圆球 FX） */
export const PROJECTILE_KEY = 'projectile-white'
export const PROJECTILE_URL = assetUrl('fx/projectile-white.png')

export type AudioEvent =
  | 'player-hurt'
  | 'shoot'
  | 'enemy-hurt'
  | 'enemy-death'
  | 'exit-unlock'
  | 'player-death'
  | 'level-clear'
  | 'warning-shot'

/** 本地音效。使用仓库内的 WAV，AudioSystem 加载失败时仍会静默降级。 */
export const AUDIO_FILES: readonly { event: AudioEvent; url: string }[] = [
  { event: 'player-hurt', url: assetUrl('audio/player-hurt.wav') },
  { event: 'shoot', url: assetUrl('audio/shoot.wav') },
  { event: 'enemy-hurt', url: assetUrl('audio/enemy-hurt.wav') },
  { event: 'enemy-death', url: assetUrl('audio/enemy-death.wav') },
  { event: 'exit-unlock', url: assetUrl('audio/exit-unlock.wav') },
  { event: 'player-death', url: assetUrl('audio/player-death.wav') },
  { event: 'level-clear', url: assetUrl('audio/level-clear.wav') },
  { event: 'warning-shot', url: assetUrl('audio/warning-shot.wav') },
]
