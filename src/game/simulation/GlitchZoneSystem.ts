import type { GameState } from './GameState';
import type { GlitchZone } from './GlitchZone';

/** 故障场半径（像素） */
export const GLITCH_ZONE_RADIUS = 70;
/** 故障场存在帧数 */
export const GLITCH_ZONE_FRAMES = 150;
/** 同屏故障场上限，超了踢掉剩余帧数最少的 */
export const GLITCH_ZONE_MAX = 2;
/** 玩家在场内时 slowFrames 被刷到这个值（离场残留 20 帧） */
export const GLITCH_ZONE_SLOW_FRAMES = 20;
/** 竖直判定窗口：|player.y - zone.y| 小于它才算在场内 */
export const GLITCH_ZONE_Y_WINDOW = 40;

/**
 * 在 (x, y) 生成一个故障场。同屏已达上限时先踢掉 framesLeft 最小的。
 * y 由调用方给（瞬移前敌人的脚底 y），这里不做物理。
 */
export function pushGlitchZone(state: GameState, x: number, y: number): GlitchZone {
  while (state.glitchZones.length >= GLITCH_ZONE_MAX) {
    let oldest = 0;
    for (let i = 1; i < state.glitchZones.length; i++) {
      if (state.glitchZones[i]!.framesLeft < state.glitchZones[oldest]!.framesLeft) {
        oldest = i;
      }
    }
    state.glitchZones.splice(oldest, 1);
  }
  const zone: GlitchZone = {
    id: state.nextZoneId,
    x,
    y,
    radius: GLITCH_ZONE_RADIUS,
    framesLeft: GLITCH_ZONE_FRAMES,
  };
  state.nextZoneId += 1;
  state.glitchZones.push(zone);
  return zone;
}

/**
 * 每帧推进：倒计时、移除过期、判定玩家是否在场内。
 * 在 updateEnemies 之后、resolveCombat 之前调用。
 * slowFrames 的递减统一在这里做，不要在 updatePlayer / tickFlashInvuln 再减一次。
 */
export function updateGlitchZones(state: GameState): void {
  const player = state.player;

  // 先统一递减离场残留
  if (player.slowFrames > 0) {
    player.slowFrames -= 1;
  }

  for (const zone of state.glitchZones) {
    zone.framesLeft -= 1;
    if (zone.framesLeft <= 0) continue;
    const inZone =
      Math.abs(player.position.x - zone.x) < zone.radius &&
      Math.abs(player.position.y - zone.y) < GLITCH_ZONE_Y_WINDOW;
    if (inZone) {
      player.slowFrames = Math.max(player.slowFrames, GLITCH_ZONE_SLOW_FRAMES);
    }
  }

  state.glitchZones = state.glitchZones.filter((zone) => zone.framesLeft > 0);
}
