import type { PlatformRect } from '../config';
import { type Aabb, type CombatBody, syncHurtbox } from './EntityState';

/** 两 AABB 是否相交（边缘相贴不算穿透，用严格重叠） */
export function overlap(a: Aabb, b: Aabb): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** 圆与 AABB 是否相交（圆心在盒内或距离最近边小于半径） */
export function circleOverlapsAabb(
  cx: number,
  cy: number,
  radius: number,
  box: Aabb,
): boolean {
  const nearestX = Math.max(box.x, Math.min(cx, box.x + box.w));
  const nearestY = Math.max(box.y, Math.min(cy, box.y + box.h));
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}

/**
 * 用当前 velocity 移动并做 X/Y 分离解算。
 * 重力由调用方预先写入 velocity.y，这里不再叠加。
 */
export function moveAndCollide(
  body: CombatBody,
  platforms: readonly PlatformRect[],
  dt: number,
  worldWidth: number,
): void {
  const prevX = body.position.x;
  const prevY = body.position.y;
  const wasGrounded = body.grounded;
  const halfW = body.width / 2;
  let nextX = prevX + body.velocity.x * dt;
  let nextY = prevY + body.velocity.y * dt;
  nextX = Math.max(halfW, Math.min(worldWidth - halfW, nextX));
  body.grounded = false;

  // 先处理竖直穿越，再处理真正的侧面扫掠，避免平台下方被提前推开。
  nextY = resolveSweptY(body, platforms, prevX, prevY, nextX, nextY);
  nextX = resolveSweptX(body, platforms, prevX, prevY, nextX, nextY);

  // 没有竖直速度时，保留上一帧的真实支撑面。否则静止角色会在
  // “grounded=false + vy=0” 与下一帧重力落地之间来回抖动。
  if (
    wasGrounded &&
    body.velocity.y === 0 &&
    Math.abs(nextY - prevY) < 0.0001 &&
    platforms.some((p) =>
      Math.abs(prevY - p.y) < 0.0001 &&
      overlapsXRange(nextX - halfW, nextX + halfW, p),
    )
  ) {
    body.grounded = true;
  }

  body.position.x = nextX;
  body.position.y = nextY;
  syncHurtbox(body);
}

function overlapsXRange(left: number, right: number, platform: PlatformRect): boolean {
  return right > platform.x && left < platform.x + platform.w;
}

/** 上升撞底、下降落地。没碰到边就完全不改位置。 */
function resolveSweptY(
  body: CombatBody,
  platforms: readonly PlatformRect[],
  prevX: number,
  prevY: number,
  nextX: number,
  nextY: number,
): number {
  const half = body.width / 2;
  let y = nextY;

  for (const p of platforms) {
    // 上升时从底部穿过，不挡、不吸附，方便直接跳上台面。
    if (body.velocity.y < 0) continue;
    // 下蹲穿台期间单向平台不承接（只有玩家有这个字段）
    const dropping = (body as { dropThroughFrames?: number }).dropThroughFrames;
    if (dropping !== undefined && dropping > 0) continue;
    if (body.velocity.y > 0 && prevY <= p.y && y >= p.y) {
      const crossing = (p.y - prevY) / (y - prevY);
      const xAtCrossing = prevX + (nextX - prevX) * crossing;
      if (overlapsXRange(xAtCrossing - half, xAtCrossing + half, p)) {
        y = p.y;
        body.velocity.y = 0;
        body.grounded = true;
      }
    }
  }
  return y;
}

/** 只有身体在平台高度上、并且从侧面扫过边界时才推回。 */
function resolveSweptX(
  body: CombatBody,
  platforms: readonly PlatformRect[],
  prevX: number,
  prevY: number,
  nextX: number,
  nextY: number,
): number {
  const half = body.width / 2;
  let x = nextX;

  for (const p of platforms) {
    // 从下方往上穿的时候，不要用侧面把人推开。
    if (body.velocity.y < 0 && prevY > p.y) continue;
    const prevRight = prevX + half;
    const prevLeft = prevX - half;
    const nextRight = x + half;
    const nextLeft = x - half;
    if (prevRight <= p.x && nextRight > p.x) {
      const crossing = (p.x - prevRight) / (nextRight - prevRight);
      const yAtCrossing = prevY + (nextY - prevY) * crossing;
      if (verticalOverlapsPlatform(yAtCrossing, body.height, p)) {
        x = p.x - half;
        body.velocity.x = 0;
      }
    } else if (prevLeft >= p.x + p.w && nextLeft < p.x + p.w) {
      const crossing = (p.x + p.w - prevLeft) / (nextLeft - prevLeft);
      const yAtCrossing = prevY + (nextY - prevY) * crossing;
      if (verticalOverlapsPlatform(yAtCrossing, body.height, p)) {
        x = p.x + p.w + half;
        body.velocity.x = 0;
      }
    }
  }
  return x;
}

function verticalOverlapsPlatform(
  feetY: number,
  bodyHeight: number,
  platform: PlatformRect,
): boolean {
  const top = feetY - bodyHeight;
  return feetY > platform.y && top < platform.y + platform.h;
}
