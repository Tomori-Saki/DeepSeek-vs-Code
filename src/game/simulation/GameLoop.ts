import { SIM } from '../config';
import { hasNextLevel } from '../levels';
import { moveAndCollide } from './CollisionSystem';
import {
  resolveCombat,
  spawnPlayerProjectile,
  updateProjectiles,
} from './CombatSystem';
import { updateEnemies } from './EnemySystem';
import { updateGlitchZones } from './GlitchZoneSystem';
import { updateHeapFragments } from './HeapFragmentSystem';
import {
  createInitialState,
  loadLevel,
  resetGameState,
  type GameState,
} from './GameState';
import { updateLevel } from './LevelSystem';
import { applyGravity, syncHurtbox } from './EntityState';

export interface InputFrame {
  moveX: -1 | 0 | 1;
  jumpHeld: boolean;
  jumpPressed: boolean;
  attackPressed: boolean;
  pausePressed: boolean;
  debugPressed: boolean;
  restartPressed: boolean;
  nextLevelPressed: boolean;
  /** S/下方向边沿：从薄平台直接落下 */
  dropPressed: boolean;
}

const EMPTY_EDGE: Pick<
  InputFrame,
  | 'jumpPressed'
  | 'attackPressed'
  | 'pausePressed'
  | 'debugPressed'
  | 'restartPressed'
  | 'nextLevelPressed'
  | 'dropPressed'
> = {
  jumpPressed: false,
  attackPressed: false,
  pausePressed: false,
  debugPressed: false,
  restartPressed: false,
  nextLevelPressed: false,
  dropPressed: false,
};

export class GameLoop {
  readonly state: GameState;
  private accumulator = 0;

  constructor() {
    this.state = createInitialState();
  }

  reset(): void {
    resetGameState(this.state);
    this.accumulator = 0;
  }

  /** 结算界面「下一关」按钮：载入下一关；没有下一关时不动。 */
  advanceToNextLevel(): void {
    if (hasNextLevel(this.state.levelIndex)) {
      loadLevel(this.state, this.state.levelIndex + 1);
    }
  }

  /**
   * 变帧 dt → 固定子步。边沿输入只在本 step 第一个子步消费一次，
   * 保证战斗时机不依赖渲染回调频率。
   */
  step(dtSeconds: number, input: InputFrame): void {
    const dt = Math.max(0, Math.min(dtSeconds, SIM.maxFrameDt));
    this.accumulator += dt;

    let sub = 0;
    let first = true;
    while (this.accumulator >= SIM.fixedDt && sub < 5) {
      const edge = first
        ? input
        : { ...input, ...EMPTY_EDGE };
      const shouldStop = this.fixedStep(edge);
      this.accumulator -= SIM.fixedDt;
      sub += 1;
      first = false;
      if (shouldStop) {
        this.accumulator = 0;
        return;
      }
    }
  }

  /** @returns true 表示本 step 应立即结束（如 restart） */
  private fixedStep(input: InputFrame): boolean {
    const state = this.state;

    if (input.debugPressed) {
      state.debug = !state.debug;
    }

    // 调试后门：只有 debug 打开才跳关。最后一关再跳就回第一关。
    if (input.nextLevelPressed && state.debug) {
      loadLevel(state, hasNextLevel(state.levelIndex) ? state.levelIndex + 1 : 0);
      return true;
    }

    if (input.restartPressed) {
      this.reset();
      return true;
    }

    if (input.pausePressed) {
      if (state.match === 'playing') state.match = 'paused';
      else if (state.match === 'paused') state.match = 'playing';
    }

    if (state.match === 'levelCleared') {
      if (state.clearFrames > 0) state.clearFrames -= 1;
      if (state.clearFrames === 0) {
        state.match = 'transitioning';
        state.transitionFrames = 60;
      }
    } else if (state.match === 'transitioning') {
      if (state.transitionFrames > 0) state.transitionFrames -= 1;
      if (state.transitionFrames === 0) {
        // 最后一关通关后回到第一关，循环游玩
        loadLevel(state, hasNextLevel(state.levelIndex) ? state.levelIndex + 1 : 0);
      }
    }

    // 非 playing：冻结位移、弹丸与手枪计时，不推进模拟
    if (state.match !== 'playing') {
      return false;
    }

    // hit-stop：只倒数，冻结位移、弹丸、手枪计时器与重力
    if (state.hitStopFrames > 0) {
      state.hitStopFrames -= 1;
      return false;
    }

    // slowFrames 的递减统一在 updateGlitchZones 里做，这里不再减

    this.updatePlayer(state, input);
    moveAndCollide(state.player, state.platforms, SIM.fixedDt, state.worldWidth);

    updateEnemies(state);
    for (const enemy of state.enemies) {
      moveAndCollide(enemy, state.platforms, SIM.fixedDt, state.worldWidth);
    }

    // 故障场：在敌人行动之后、战斗结算之前判定玩家是否踩进减速区
    updateGlitchZones(state);

    resolveCombat(state);
    updateProjectiles(state, SIM.fixedDt);
    // 碎片倒计时在弹丸之后：落地生成碎片和碎片回收同一帧完成
    updateHeapFragments(state);
    updateLevel(state);

    if (state.shakeFrames > 0) {
      state.shakeFrames -= 1;
    }

    tickFlashInvuln(state.player);
    for (const enemy of state.enemies) tickFlashInvuln(enemy);

    state.frame += 1;
    return false;
  }

  private updatePlayer(state: GameState, input: InputFrame): void {
    const player = state.player;

    // 优先级：dead > hurt > attack > 空中 jump/fall > run > idle
    if (player.locomotion === 'dead' || player.health <= 0) {
      player.locomotion = 'dead';
      player.velocity.x = 0;
      player.velocity.y = 0;
      player.hitbox = null;
      syncHurtbox(player);
      return;
    }

    if (player.hurtFrames > 0) {
      player.hurtFrames -= 1;
      player.locomotion = 'hurt';
      player.velocity.x *= 0.86;
      // 受击期间仍受重力，便于被击飞后落地
      applyGravity(player);
      if (player.hurtFrames === 0) {
        player.locomotion = player.grounded ? 'idle' : 'fall';
      } else {
        player.hitbox = null;
        syncHurtbox(player);
        return;
      }
    }

    // 手枪冷却倒数（phase==='none' 时仍可走表）
    if (player.attackCooldownFrames > 0) {
      player.attackCooldownFrames -= 1;
    }

    // —— 手枪攻击阶段：startup → fire（生成弹丸）→ recovery → none+cooldown ——
    if (player.attackPhase !== 'none') {
      player.attackFramesLeft -= 1;
      if (player.attackFramesLeft <= 0) {
        if (player.attackPhase === 'startup') {
          player.attackPhase = 'fire';
          player.attackFramesLeft = SIM.pistolFireFrames;
          // 进入 fire 的那一步生成且仅生成 1 发
          if (!player.firedThisShot) {
            spawnPlayerProjectile(state);
            player.firedThisShot = true;
          }
        } else if (player.attackPhase === 'fire') {
          player.attackPhase = 'recovery';
          player.attackFramesLeft = SIM.pistolRecoveryFrames;
        } else {
          // recovery 结束：进入冷却，允许下一枪
          player.attackPhase = 'none';
          player.attackFramesLeft = 0;
          player.firedThisShot = false;
          player.attackCooldownFrames = SIM.pistolCooldownFrames;
          player.locomotion = player.grounded ? 'idle' : 'fall';
        }
      }
    }

    // 起手：phase none、冷却结束、非 hurt/dead
    if (
      input.attackPressed &&
      player.attackPhase === 'none' &&
      player.attackCooldownFrames === 0 &&
      player.locomotion !== 'hurt'
    ) {
      player.attackPhase = 'startup';
      player.attackFramesLeft = SIM.pistolStartupFrames;
      player.locomotion = 'attack';
      player.firedThisShot = false;
    }

    // 玩家永远没有近战击打盒
    player.hitbox = null;

    const attacking = player.attackPhase !== 'none';
    const inStartupOrFire =
      player.attackPhase === 'startup' || player.attackPhase === 'fire';

    // 故障场减速：水平移速 ×0.55、跳跃初速 ×0.82
    const moveScale = player.slowFrames > 0 ? 0.55 : 1;
    const jumpScale = player.slowFrames > 0 ? 0.82 : 1;

    // 水平移动
    if (inStartupOrFire) {
      player.velocity.x = 0;
    } else if (player.attackPhase === 'recovery') {
      player.velocity.x = input.moveX * SIM.moveSpeed * 0.35 * moveScale;
      if (input.moveX !== 0) player.facing = input.moveX;
    } else if (!attacking) {
      if (player.grounded) {
        player.velocity.x = input.moveX * SIM.moveSpeed * moveScale;
      } else {
        // 空中水平速度只来自空中操控，跳跃不加水平冲量
        player.velocity.x = input.moveX * SIM.moveSpeed * SIM.airControl * moveScale;
      }
      if (input.moveX !== 0) player.facing = input.moveX;
    }

    // 土狼 / 跳跃缓冲
    if (player.grounded) {
      player.coyoteFrames = SIM.coyoteFrames;
    } else if (player.coyoteFrames > 0) {
      player.coyoteFrames -= 1;
    }

    if (player.dropThroughFrames > 0) {
      player.dropThroughFrames -= 1;
    }

    // S 下蹲：站在薄平台（h ≤ 24）上时直接穿过落下；厚地面（h = 80）不穿
    if (input.dropPressed && player.grounded) {
      const feetY = player.position.y;
      const thin = state.platforms.find(
        (p) =>
          Math.abs(feetY - p.y) < 0.0001 &&
          player.position.x >= p.x &&
          player.position.x <= p.x + p.w &&
          p.h <= 24,
      );
      if (thin) {
        player.dropThroughFrames = 14;
        player.grounded = false;
        player.coyoteFrames = 0;
        player.velocity.y = 30;
      }
    }

    if (input.jumpPressed) {
      player.jumpBufferFrames = SIM.jumpBufferFrames;
    } else if (player.jumpBufferFrames > 0) {
      player.jumpBufferFrames -= 1;
    }

    const canJump = player.locomotion !== 'hurt' && !inStartupOrFire;

    let didJump = false;
    if (canJump && player.coyoteFrames > 0 && player.jumpBufferFrames > 0) {
      // 只改竖直速度，绝不加水平冲量；故障场内起跳初速 ×0.82
      player.velocity.y = SIM.jumpVelocity * jumpScale;
      player.grounded = false;
      player.coyoteFrames = 0;
      player.jumpBufferFrames = 0;
      didJump = true;
    }

    // 重力：贴地且本帧未起跳则清零，否则累积
    if (player.grounded && !didJump) {
      player.velocity.y = 0;
    } else {
      applyGravity(player);
    }

    // 松开跳跃键缩短上升：每子步最多一次
    if (!input.jumpHeld && player.velocity.y < 0) {
      player.velocity.y *= 0.55;
    }

    // locomotion 展示态（不覆盖 dead/hurt/attack）
    if (player.locomotion !== 'hurt' && player.attackPhase === 'none') {
      if (!player.grounded) {
        player.locomotion = player.velocity.y < 0 ? 'jump' : 'fall';
      } else if (input.moveX !== 0) {
        player.locomotion = 'run';
      } else {
        player.locomotion = 'idle';
      }
    } else if (player.attackPhase !== 'none') {
      player.locomotion = 'attack';
    }

    syncHurtbox(player);
  }
}

function tickFlashInvuln(body: {
  flashFrames: number;
  invulnFrames: number;
}): void {
  if (body.flashFrames > 0) body.flashFrames -= 1;
  if (body.invulnFrames > 0) body.invulnFrames -= 1;
}
