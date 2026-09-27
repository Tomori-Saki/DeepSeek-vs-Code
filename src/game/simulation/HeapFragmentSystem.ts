import type { GameState } from './GameState';
import type { HeapFragment } from './HeapFragment';

/** 碎片边长（像素），命中判定与渲染共用这个尺寸 */
export const HEAP_FRAGMENT_SIZE = 20;
/** 碎片初始血量 */
export const HEAP_FRAGMENT_HEALTH = 10;
/** 碎片存在帧数 */
export const HEAP_FRAGMENT_FRAMES = 480;
/** 受击闪白帧数 */
export const HEAP_FRAGMENT_HURT_FRAMES = 4;

/** 在 (x, platformTopY) 生成一块贴地碎片。y 存中心，方块底边贴平台顶面。 */
export function spawnHeapFragment(state: GameState, x: number, platformTopY: number): HeapFragment {
  const fragment: HeapFragment = {
    id: state.nextFragmentId,
    x,
    y: platformTopY - HEAP_FRAGMENT_SIZE / 2,
    health: HEAP_FRAGMENT_HEALTH,
    framesLeft: HEAP_FRAGMENT_FRAMES,
    alive: true,
    hurtFrames: 0,
  };
  state.nextFragmentId += 1;
  state.fragments.push(fragment);
  return fragment;
}

/** 每帧推进：倒计时、受击闪白倒数、过滤死亡碎片。在 updateProjectiles 之后调用。 */
export function updateHeapFragments(state: GameState): void {
  for (const fragment of state.fragments) {
    if (!fragment.alive) continue;
    fragment.framesLeft -= 1;
    if (fragment.hurtFrames > 0) fragment.hurtFrames -= 1;
    if (fragment.framesLeft <= 0 || fragment.health <= 0) {
      fragment.alive = false;
    }
  }
  state.fragments = state.fragments.filter((fragment) => fragment.alive);
}

/** 玩家弹丸命中碎片时扣血；归零由 updateHeapFragments 统一回收 */
export function damageFragment(state: GameState, id: number, amount: number): void {
  const fragment = state.fragments.find((f) => f.id === id && f.alive);
  if (!fragment) return;
  fragment.health = Math.max(0, fragment.health - amount);
  fragment.hurtFrames = HEAP_FRAGMENT_HURT_FRAMES;
  if (fragment.health <= 0) {
    fragment.alive = false;
  }
}
