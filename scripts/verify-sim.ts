/**
 * 仅通过 GameLoop 公开 API（及导出的弹丸结算纯函数）验证模拟层。
 * 禁止直接改血量或传送。失败时设置 process.exitCode=1 并最终抛错。
 */
import { SIM, type PlatformRect } from '../src/game/config';
import { InputMap } from '../src/game/input/InputMap';
import { LEVELS } from '../src/game/levels';
import { LEVEL1, platformUnder } from '../src/game/levels/level1';
import { createInitialState, loadLevel, resetGameState } from '../src/game/simulation/GameState';
import {
  resolveProjectileHits,
  spawnHeapShot,
  spawnNullProjectile,
  updateProjectiles,
} from '../src/game/simulation/CombatSystem';
import { pushGlitchZone } from '../src/game/simulation/GlitchZoneSystem';
import {
  spawnHeapFragment,
  updateHeapFragments,
} from '../src/game/simulation/HeapFragmentSystem';
import { GameLoop, type InputFrame } from '../src/game/simulation/GameLoop';
import { spawnEnemy } from '../src/game/simulation/EnemyState';
import { WALL_INITIAL_RIGHT, WALL_WIDTH } from '../src/game/simulation/BossSystem';
import type { ProjectileState } from '../src/game/simulation/ProjectileState';

const idle: InputFrame = {
  moveX: 0,
  jumpHeld: false,
  jumpPressed: false,
  attackPressed: false,
  pausePressed: false,
  debugPressed: false,
  restartPressed: false,
  nextLevelPressed: false,
  dropPressed: false,
};

function firstEnemy(loop: GameLoop) {
  return loop.state.enemies[0];
}

function nearestEnemy(loop: GameLoop) {
  const x = loop.state.player.position.x;
  return loop.state.enemies.reduce((best, enemy) =>
    Math.abs(enemy.position.x - x) < Math.abs(best.position.x - x) ? enemy : best,
  );
}

function input(partial: Partial<InputFrame>): InputFrame {
  return { ...idle, ...partial };
}

/** 以固定 dt 推进一步（等于一个渲染回调送来 fixedDt） */
function stepOnce(loop: GameLoop, partial: Partial<InputFrame> = {}): void {
  loop.step(SIM.fixedDt, input(partial));
}

function stepFrames(
  loop: GameLoop,
  frames: number,
  partial: Partial<InputFrame> = {},
): void {
  for (let i = 0; i < frames; i++) {
    stepOnce(loop, partial);
  }
}

const failures: string[] = [];

function check(name: string, ok: boolean, detail: string): void {
  if (ok) {
    console.log(`通过：${name} — ${detail}`);
  } else {
    console.log(`失败：${name} — ${detail}`);
    failures.push(name);
  }
}

function main(): void {
  // 1. 向右移动约 0.5 秒后 player.x 增加
  {
    const loop = new GameLoop();
    const x0 = loop.state.player.position.x;
    const frames = Math.round(0.5 * SIM.fixedHz);
    stepFrames(loop, frames, { moveX: 1 });
    const x1 = loop.state.player.position.x;
    check('向右移动', x1 > x0, `x0=${x0.toFixed(1)} → x1=${x1.toFixed(1)}`);
  }

  // 1b. 静止在地面时支撑状态稳定，不能在 idle/fall 之间闪烁。
  {
    const loop = new GameLoop();
    let groundedEveryFrame = true;
    let idleEveryFrame = true;
    for (let i = 0; i < 120; i++) {
      stepOnce(loop);
      groundedEveryFrame &&= loop.state.player.grounded;
      idleEveryFrame &&= loop.state.player.locomotion === 'idle';
    }
    check(
      '静止支撑状态稳定',
      groundedEveryFrame && idleEveryFrame,
      `grounded=${groundedEveryFrame} idle=${idleEveryFrame} y=${loop.state.player.position.y}`,
    );
  }

  // 2. 地面 jumpPressed 后若干帧内脚底 y < 440 或 velocity.y < 0
  {
    const loop = new GameLoop();
    stepOnce(loop, { jumpPressed: true, jumpHeld: true });
    let rose = false;
    for (let i = 0; i < 20; i++) {
      stepOnce(loop, { jumpHeld: true });
      const p = loop.state.player;
      if (p.position.y < 440 || p.velocity.y < 0) {
        rose = true;
        break;
      }
    }
    check(
      '地面起跳',
      rose,
      `y=${loop.state.player.position.y.toFixed(1)} vy=${loop.state.player.velocity.y.toFixed(1)}`,
    );
  }

  // 2b. 站定跳跃若干帧后 velocity.x 仍为 0（没有向前冲量）
  {
    const loop = new GameLoop();
    stepOnce(loop, { jumpPressed: true, jumpHeld: true });
    let vxAlwaysZero = true;
    for (let i = 0; i < 30; i++) {
      stepOnce(loop, { jumpHeld: true });
      if (loop.state.player.velocity.x !== 0) {
        vxAlwaysZero = false;
        break;
      }
    }
    check(
      '跳跃无水平冲量',
      vxAlwaysZero && loop.state.player.velocity.x === 0,
      `vx=${loop.state.player.velocity.x}`,
    );
  }

  // 3. 一次 attackPressed 只产生 1 发弹丸，朝右飞且 vy=0，命中扣 pistolDamage 一次
  {
    const loop = new GameLoop();
    const hpBefore = firstEnemy(loop).health;
    stepOnce(loop, { attackPressed: true });

    // 等到 fire：startup 结束后应恰好 1 发
    const waitFire =
      SIM.pistolStartupFrames + SIM.pistolFireFrames + 2;
    let maxAlive = 0;
    let sawRight = false;
    let sawVy0 = false;
    for (let i = 0; i < waitFire + 80; i++) {
      stepOnce(loop);
      maxAlive = Math.max(maxAlive, loop.state.projectiles.length);
      for (const p of loop.state.projectiles) {
        if (p.vx > 0) sawRight = true;
        if (p.vy === 0) sawVy0 = true;
      }
      // 命中后弹丸会被移除，敌人掉血
      if (firstEnemy(loop).health < hpBefore) break;
    }

    const lost = hpBefore - firstEnemy(loop).health;
    check(
      '一次按键只出一发',
      maxAlive === 1,
      `过程中最多存活弹丸数=${maxAlive}`,
    );
    check(
      '弹丸朝右且竖直速度为0',
      sawRight && sawVy0,
      `sawRight=${sawRight} sawVy0=${sawVy0}`,
    );
    check(
      '弹丸命中单次伤害',
      lost === SIM.pistolDamage && loop.state.projectiles.length === 0,
      `期望扣 ${SIM.pistolDamage}，实际扣 ${lost}；剩余弹丸 ${loop.state.projectiles.length}`,
    );

    // 再等一整段武器流程，确认不会连续多扣
    const afterHp = firstEnemy(loop).health;
    stepFrames(
      loop,
      SIM.pistolRecoveryFrames + SIM.pistolCooldownFrames + 20,
    );
    check(
      '命中后不会连续多扣',
      firstEnemy(loop).health === afterHp,
      `命中后血量 ${afterHp} → ${firstEnemy(loop).health}`,
    );
  }

  // 3b. 弹丸不伤害射手：构造压在玩家 hurtbox 上的弹丸，调用纯函数结算
  {
    const loop = new GameLoop();
    const player = loop.state.player;
    const hpBefore = player.health;
    syncHurtForTest(loop);
    const box = player.hurtbox;
    const proj: ProjectileState = {
      id: 999,
      ownerId: 'player',
      gravity: 0,
      spawnFragmentOnLand: false,
      x: box.x + box.w / 2,
      y: box.y + box.h / 2,
      vx: 0,
      vy: 0,
      radius: SIM.projectileRadius,
      damage: SIM.pistolDamage,
      lifetimeFrames: 30,
      originX: box.x + box.w / 2,
      originY: box.y + box.h / 2,
      travelDistance: 0,
      maxDistance: SIM.projectileMaxDistance,
      alive: true,
    };
    loop.state.projectiles.push(proj);
    resolveProjectileHits(loop.state);
    check(
      '弹丸不伤害射手',
      loop.state.player.health === hpBefore && proj.alive,
      `玩血 ${hpBefore} → ${loop.state.player.health}，弹丸仍 alive=${proj.alive}`,
    );
  }

  // 3c. startup/fire/recovery/cooldown 期间每帧按攻击，冷却结束前只有 1 发
  {
    const loop = new GameLoop();
    stepOnce(loop, { attackPressed: true });
    const totalBusy =
      SIM.pistolStartupFrames +
      SIM.pistolFireFrames +
      SIM.pistolRecoveryFrames +
      SIM.pistolCooldownFrames;
    let maxAlive = 0;
    let totalSeenIds = new Set<number>();
    for (let i = 0; i < totalBusy; i++) {
      stepOnce(loop, { attackPressed: true });
      maxAlive = Math.max(maxAlive, loop.state.projectiles.length);
      for (const p of loop.state.projectiles) totalSeenIds.add(p.id);
    }
    check(
      '冷却结束前连按只出一发',
      maxAlive <= 1 && totalSeenIds.size === 1,
      `maxAlive=${maxAlive} 唯一 id 数=${totalSeenIds.size}`,
    );
  }

  // 4. 贴身等待敌人攻击命中后玩家掉血（木人近战保留）
  {
    const loop = new GameLoop();
    for (let i = 0; i < 300; i++) {
      const foe = nearestEnemy(loop);
      const dx = Math.abs(foe.position.x - loop.state.player.position.x);
      if (dx < foe.attackRange) break;
      stepAdvance(loop, 1);
    }
    const hpBefore = loop.state.player.health;
    let hit = false;
    for (let i = 0; i < 400; i++) {
      stepOnce(loop);
      if (loop.state.player.health < hpBefore) {
        hit = true;
        break;
      }
    }
    const lost = hpBefore - loop.state.player.health;
    check(
      '敌人攻击命中',
      hit && lost > 0 && lost % nearestEnemy(loop).damage === 0,
      `玩家掉血 ${lost}（现血 ${loop.state.player.health}）`,
    );
  }

  // 5. 用手枪把敌人打到 0 血 → victory
  {
    const loop = new GameLoop();
    let guard = 0;
    while (firstEnemy(loop).health > 0 && loop.state.match === 'playing' && guard < 800) {
      guard += 1;
      const playerBusy =
        loop.state.player.attackPhase !== 'none' ||
        loop.state.player.attackCooldownFrames > 0 ||
        loop.state.player.locomotion === 'hurt';
      if (!playerBusy) {
        stepOnce(loop, { attackPressed: true });
      } else {
        stepOnce(loop);
      }
    }
    check(
      '击倒哨兵后仍可行动',
      firstEnemy(loop).health <= 0 &&
        loop.state.match === 'playing' &&
        !loop.state.level.exitUnlocked,
      `match=${loop.state.match} 敌血=${firstEnemy(loop).health} exit=${loop.state.level.exitUnlocked}`,
    );
  }

  // 6. 另起一局，贴身硬接敌人直到玩家归零 → defeat
  {
    const loop = new GameLoop();
    let guard = 0;
    while (loop.state.match === 'playing' && guard < 8000) {
      guard += 1;
      const foe = nearestEnemy(loop);
      const dx = Math.abs(foe.position.x - loop.state.player.position.x);
      if (dx > foe.attackRange) {
        stepAdvance(loop, 1);
      } else {
        // 不攻击、不躲开，硬吃木人挥击
        stepOnce(loop);
      }
    }
    check(
      '玩家战败',
      loop.state.match === 'defeat' && loop.state.player.health <= 0,
      `match=${loop.state.match} 玩血=${loop.state.player.health} 帧=${loop.state.frame}`,
    );
  }

  // 7. pause 冻结位置，再 pause 恢复 playing
  {
    const loop = new GameLoop();
    stepFrames(loop, 10, { moveX: 1 });
    const xPause = loop.state.player.position.x;
    const yPause = loop.state.player.position.y;
    stepOnce(loop, { pausePressed: true });
    check('进入暂停', loop.state.match === 'paused', `match=${loop.state.match}`);
    stepFrames(loop, 30, { moveX: 1 });
    const frozen =
      loop.state.player.position.x === xPause &&
      loop.state.player.position.y === yPause;
    check(
      '暂停中位置不变',
      frozen,
      `x=${loop.state.player.position.x} y=${loop.state.player.position.y}`,
    );
    stepOnce(loop, { pausePressed: true });
    check('恢复对局', loop.state.match === 'playing', `match=${loop.state.match}`);
  }

  // 7b. 暂停后弹丸坐标与玩家 attackFramesLeft 都不变
  {
    const loop = new GameLoop();
    stepOnce(loop, { attackPressed: true });
    // 等到弹丸已生成且仍在飞
    for (let i = 0; i < SIM.pistolStartupFrames + 5; i++) {
      stepOnce(loop);
      if (loop.state.projectiles.length > 0) break;
    }
    check(
      '暂停测试前已有弹丸',
      loop.state.projectiles.length > 0,
      `弹丸数=${loop.state.projectiles.length} phase=${loop.state.player.attackPhase}`,
    );
    const px = loop.state.projectiles[0]?.x ?? -1;
    const py = loop.state.projectiles[0]?.y ?? -1;
    const framesLeft = loop.state.player.attackFramesLeft;
    stepOnce(loop, { pausePressed: true });
    stepFrames(loop, 20);
    const p0 = loop.state.projectiles[0];
    check(
      '暂停冻结弹丸与攻击计时',
      !!p0 &&
        p0.x === px &&
        p0.y === py &&
        loop.state.player.attackFramesLeft === framesLeft,
      `弹丸 (${p0?.x},${p0?.y}) 期望 (${px},${py})；framesLeft ${loop.state.player.attackFramesLeft} 期望 ${framesLeft}`,
    );
  }

  // 8. restartPressed 后血量回满、match==='playing'、projectiles 为空
  {
    const loop = new GameLoop();
    for (let i = 0; i < 200; i++) {
      stepOnce(loop, { moveX: 1 });
    }
    stepOnce(loop, { attackPressed: true });
    stepFrames(loop, 40);
    stepOnce(loop, { restartPressed: true });
    check(
      '重启回满并清空弹丸',
      loop.state.match === 'playing' &&
        loop.state.player.health === SIM.playerMaxHealth &&
        loop.state.enemies.every((enemy) => enemy.health === enemy.maxHealth) &&
        !loop.state.level.exitUnlocked &&
        loop.state.frame === 0 &&
        loop.state.projectiles.length === 0,
      `match=${loop.state.match} 玩血=${loop.state.player.health} 敌血=${firstEnemy(loop).health} frame=${loop.state.frame} 弹丸=${loop.state.projectiles.length}`,
    );
  }

  // 9. debugPressed 翻转；reset 后 debug 仍保持
  {
    const loop = new GameLoop();
    const d0 = loop.state.debug;
    stepOnce(loop, { debugPressed: true });
    const d1 = loop.state.debug;
    check('调试开关翻转', d1 === !d0, `debug ${d0} → ${d1}`);
    stepOnce(loop, { restartPressed: true });
    check(
      '重置保留 debug',
      loop.state.debug === d1,
      `reset 后 debug=${loop.state.debug}（应为 ${d1}）`,
    );
  }

  // 10. 按住空格的完整跳跃能落到左右小平台；上升途中不会提前落在台面上
  landOnLedge('teach-low');
  runScrollAndPitChecks();
  runRangeChecks();
  runLevelLayoutChecks();
  runSentinelChecks();
  runKindChecks();

  // 11. 鼠标左键是单帧边沿；detach 后不再生效；暂停时点击不开火
  {
    const target = new EventTarget();
    const map = new InputMap();
    map.attach(target);
    target.dispatchEvent(leftClick());
    const pressed = map.sample();
    const held = map.sample();
    check(
      '鼠标左键只触发一帧攻击',
      pressed.attackPressed && !held.attackPressed,
      `按下=${pressed.attackPressed} 按住后再采样=${held.attackPressed}`,
    );

    const loop = new GameLoop();
    stepOnce(loop, { attackPressed: pressed.attackPressed });
    stepFrames(loop, 80);
    check(
      '按住鼠标不会连发',
      loop.state.nextProjectileId === 2,
      `已生成弹丸序号=${loop.state.nextProjectileId - 1} 场上=${loop.state.projectiles.length}`,
    );

    map.sample();
    map.detach();
    target.dispatchEvent(leftClick());
    const afterDetach = map.sample();
    check(
      'detach 后鼠标左键无效',
      !afterDetach.attackPressed,
      `attackPressed=${afterDetach.attackPressed}`,
    );

    const paused = new GameLoop();
    stepOnce(paused, { pausePressed: true });
    const clickTarget = new EventTarget();
    const pausedMap = new InputMap();
    pausedMap.attach(clickTarget);
    clickTarget.dispatchEvent(leftClick());
    stepOnce(paused, pausedMap.sample());
    check(
      '暂停时左键不会开火',
      paused.state.match === 'paused' &&
        paused.state.player.attackPhase === 'none' &&
        paused.state.projectiles.length === 0,
      `match=${paused.state.match} phase=${paused.state.player.attackPhase} 弹丸=${paused.state.projectiles.length}`,
    );
    pausedMap.detach();
    map.detach();
  }

  if (failures.length > 0) {
    process.exitCode = 1;
    throw new Error(`模拟验证失败：${failures.join('、')}`);
  }

  console.log('全部模拟验证通过。');
}

/** Node 测试里没有浏览器 MouseEvent，用带 button 的最小事件代替。 */
class LeftClickEvent extends Event {
  readonly button = 0;
  constructor() {
    super('mousedown');
  }
}

function leftClick(): LeftClickEvent {
  return new LeftClickEvent();
}

function runScrollAndPitChecks(): void {
  const loop = new GameLoop();
  check(
    '滚屏世界比视口宽',
    loop.state.worldWidth >= 2200 &&
      loop.state.worldWidth <= 2600 &&
      loop.state.exit.x > 960 &&
      loop.state.exit.x < loop.state.worldWidth,
    `world=${loop.state.worldWidth} exit=${loop.state.exit.x}`,
  );

  const block = loop.state.platforms.find((p) => p.id === 'side-block')!;
  let blocked = false;
  for (let i = 0; i < 200; i++) {
    stepOnce(loop, { moveX: -1 });
    const player = loop.state.player;
    const hitRightFace =
      player.position.x - player.width / 2 >= block.x + block.w - 1 && player.velocity.x === 0;
    if (hitRightFace) {
      blocked = true;
      break;
    }
  }
  check(
    '侧面挡住横向穿过',
    blocked && loop.state.player.position.x > block.x + block.w,
    `x=${loop.state.player.position.x.toFixed(1)} block=${block.x}`,
  );

  const ceiling = new GameLoop();
  const teach = ceiling.state.platforms.find((p) => p.id === 'teach-low')!;
  for (let i = 0; i < 80 && ceiling.state.player.position.x < teach.x + 40; i++) {
    stepOnce(ceiling, { moveX: 1 });
  }
  const beforeJump = ceiling.state.player.velocity.y;
  stepOnce(ceiling, { jumpPressed: true, jumpHeld: true });
  const jumpedVy = ceiling.state.player.velocity.y;
  let bonked = false;
  let fellAgain = false;
  let roseThrough = false;
  for (let i = 0; i < 40; i++) {
    stepOnce(ceiling, { jumpHeld: true });
    const player = ceiling.state.player;
    if (player.position.y <= teach.y) roseThrough = true;
    if (player.velocity.y === 0 && !player.grounded && player.position.y > teach.y) bonked = true;
    if (bonked && player.velocity.y > 0) fellAgain = true;
  }
  check(
    '平台下方仍能起跳',
    beforeJump >= 0 && jumpedVy < 0,
    `before=${beforeJump} after=${jumpedVy}`,
  );
  let stoodOnTop = false;
  for (let i = 0; i < 90 && !stoodOnTop; i++) {
    stepOnce(ceiling, { jumpHeld: i < 40 });
    const player = ceiling.state.player;
    if (player.grounded && player.position.y === teach.y) stoodOnTop = true;
  }
  check(
    '从底部穿过并站上台面',
    roseThrough && stoodOnTop && ceiling.state.player.velocity.y === 0,
    `through=${roseThrough} onTop=${stoodOnTop} y=${ceiling.state.player.position.y}`,
  );

  const slide = new GameLoop();
  const cover = slide.state.platforms.find((p) => p.id === 'teach-low')!;
  for (let i = 0; i < 80 && slide.state.player.position.x < cover.x + 30; i++) {
    stepOnce(slide, { moveX: 1 });
  }
  const slideX = slide.state.player.position.x;
  for (let i = 0; i < 8; i++) stepOnce(slide, { moveX: 1 });
  check(
    '平台下方横向不被空气墙挡住',
    slide.state.player.position.x > slideX + 5,
    `x ${slideX.toFixed(1)} → ${slide.state.player.position.x.toFixed(1)}`,
  );

  const movingUnder = new GameLoop();
  while (movingUnder.state.player.position.x < teach.x + 42) {
    stepOnce(movingUnder, { moveX: 1 });
  }
  const jumpStartX = movingUnder.state.player.position.x;
  stepOnce(movingUnder, {
    moveX: 1,
    jumpPressed: true,
    jumpHeld: true,
  });
  let maxXBeforeBonk = movingUnder.state.player.position.x;
  let sawBonk = false;
  for (let i = 0; i < 30; i++) {
    stepOnce(movingUnder, { moveX: 1, jumpHeld: true });
    const player = movingUnder.state.player;
    maxXBeforeBonk = Math.max(maxXBeforeBonk, player.position.x);
    if (player.velocity.y === 0 && !player.grounded && player.position.y > teach.y) {
      sawBonk = true;
      break;
    }
  }
  check(
    '从底部跳上时不会被空气墙拦住',
    !sawBonk && maxXBeforeBonk > jumpStartX + 2,
    `起跳 x=${jumpStartX.toFixed(1)} → 穿过时最大 x=${maxXBeforeBonk.toFixed(1)}`,
  );

  const fall = new GameLoop();
  let guard = 0;
  while (fall.state.match === 'playing' && guard < 500) {
    guard += 1;
    stepOnce(fall, { moveX: 1 });
  }
  check(
    '深坑掉落失败',
    fall.state.match === 'defeat' && fall.state.player.position.y > fall.state.fallDeathY,
    `match=${fall.state.match} y=${fall.state.player.position.y.toFixed(1)}`,
  );
  stepOnce(fall, { restartPressed: true });
  check(
    '掉落后重置',
    fall.state.match === 'playing' &&
      fall.state.player.health === SIM.playerMaxHealth &&
      fall.state.player.position.x === LEVEL1_SPAWN_X,
    `match=${fall.state.match} x=${fall.state.player.position.x} hp=${fall.state.player.health}`,
  );
}

function runLevelLayoutChecks(): void {
  const ids = new Set(LEVEL1.platforms.map((platform) => platform.id));
  const requiredRoutes = [
    'ground-tutorial',
    'ground-combat1',
    'ground-low-route',
    'ground-combat2',
    'upper-route-one',
    'upper-route-two',
    'upper-route-three',
    'ground-buffer',
    'ground-exit',
  ];
  const ground = LEVEL1.platforms
    .filter((platform) => platform.y === 440)
    .slice()
    .sort((a, b) => a.x - b.x);
  const pitWidths = ground
    .slice(0, -1)
    .map((platform, index) => ground[index + 1].x - (platform.x + platform.w))
    .filter((width) => width >= 24);
  const distinctPitWidths = new Set(pitWidths);
  const enemySupportsValid = LEVEL1.enemies.every((spawn) =>
    LEVEL1.platforms.some(
      (platform) =>
        spawn.y === platform.y &&
        spawn.x >= platform.x + 20 &&
        spawn.x <= platform.x + platform.w - 20,
    ),
  );
  check(
    '第一关包含分区与高低路线',
    LEVEL1.worldWidth === 2600 &&
      requiredRoutes.every((id) => ids.has(id)) &&
      distinctPitWidths.size >= 3 &&
      enemySupportsValid,
    `world=${LEVEL1.worldWidth} 坑宽=${pitWidths.join(',')} 路线=${requiredRoutes.filter((id) => ids.has(id)).length}/${requiredRoutes.length}`,
  );
}

const LEVEL1_SPAWN_X = 120;

function runRangeChecks(): void {
  const loop = new GameLoop();
  const far = loop.state.enemies.filter(
    (enemy) => enemy.position.x > loop.state.player.position.x + SIM.projectileMaxDistance + 40,
  );
  let guard = 0;
  while (guard < 400) {
    guard += 1;
    if (canShoot(loop)) stepOnce(loop, { attackPressed: true });
    else stepOnce(loop);
  }
  const farAlive = far.every((enemy) => {
    const now = loop.state.enemies.find((item) => item.id === enemy.id);
    return now !== undefined && now.health === enemy.health;
  });
  check(
    '站桩射击打不到远处敌人',
    far.length > 0 && farAlive && loop.state.projectiles.every((p) => p.travelDistance < SIM.projectileMaxDistance + 1),
    `far=${far.map((e) => e.id).join(',')} alive=${farAlive}`,
  );

  const range = new GameLoop();
  stepOnce(range, { attackPressed: true });
  let removed = false;
  for (let i = 0; i < 120; i++) {
    stepOnce(range);
    if (range.state.projectiles.length === 0) {
      removed = true;
      break;
    }
  }
  check(
    '弹丸超过最大射程后被清除',
    removed,
    `剩余=${range.state.projectiles.length} max=${SIM.projectileMaxDistance}`,
  );
}

function hasFloor(loop: GameLoop, x: number, feetY: number): boolean {
  return loop.state.platforms.some(
    (p) => feetY >= p.y - 2 && feetY <= p.y + 6 && x >= p.x + 8 && x <= p.x + p.w - 8,
  );
}

function stepAdvance(loop: GameLoop, dir: -1 | 1, lookahead = 28): void {
  const player = loop.state.player;
  const next = player.position.x + dir * lookahead;
  // 测试导航优先走地面；站在教学台上时先自然落回地面，避免把台边
  // 误判成深坑。检测“当前地面”和“下一段地面”是否不同，避免只看
  // 目标点导致过早起跳或刚好踩到坑边才起跳。
  const onMainGround = player.grounded && player.position.y === 440;
  const gap =
    onMainGround &&
    (crossesGroundGap(loop, player.position.x, next) || !groundAt(loop, next));
  const jump = gap;
  stepOnce(loop, {
    moveX: dir,
    jumpPressed: jump,
    jumpHeld: jump || player.velocity.y < 0,
  });
}

function groundAt(loop: GameLoop, x: number): PlatformRect | undefined {
  return loop.state.platforms.find(
    (platform) =>
      platform.y === 440 &&
      x >= platform.x + 8 &&
      x <= platform.x + platform.w - 8,
  );
}

function crossesGroundGap(loop: GameLoop, fromX: number, toX: number): boolean {
  const from = groundAt(loop, fromX);
  if (!from) return false;
  const to = groundAt(loop, toX);
  if (!to || to.id !== from.id) return true;
  const minX = Math.min(fromX, toX);
  const maxX = Math.max(fromX, toX);
  return loop.state.platforms.some(
    (platform) =>
      platform.y === 440 &&
      platform.id !== from.id &&
      platform.x < maxX &&
      platform.x + platform.w > minX,
  );
}

function canShoot(loop: GameLoop): boolean {
  const player = loop.state.player;
  return (
    player.attackPhase === 'none' &&
    player.attackCooldownFrames === 0 &&
    player.locomotion !== 'hurt' &&
    player.health > 0
  );
}

function clearAll(loop: GameLoop): void {
  // 清敌验证按世界中的敌人顺序推进：先处理当前区域，再跨坑进入下一段。
  // 每个目标都用真实移动、跳跃和手枪输入击杀，避免把测试变成改血量/传送。
  const order = [...loop.state.enemies]
    .sort((a, b) => a.position.x - b.position.x || b.position.y - a.position.y)
    .map((enemy) => enemy.id);
  let guard = 0;
  while (
    loop.state.enemies.some((enemy) => enemy.health > 0) &&
    loop.state.match === 'playing' &&
    guard < 8000
  ) {
    guard += 1;
    const player = loop.state.player;
    const target = order
      .map((id) => loop.state.enemies.find((enemy) => enemy.id === id))
      .find((enemy) => enemy && enemy.health > 0);
    if (!target) break;

    if (target.position.y < 400) {
      clearUpperTarget(loop, target);
    } else {
      clearGroundTarget(loop, target);
    }
  }
}

function clearGroundTarget(
  loop: GameLoop,
  target: GameLoop['state']['enemies'][number],
): void {
  const player = loop.state.player;
  const dx = target.position.x - player.position.x;
  const distance = Math.abs(dx);
  const dir: -1 | 1 = dx < 0 ? -1 : 1;
  // 站在警戒范围外开火；近战和瞬移敌人都不会被引到玩家身边。
  // 目标在地面而玩家仍在高台时，先从高台右侧落回主路，不能在台面
  // 上反复横走后掉进深坑。
  if (player.position.y < 430 || !player.grounded) {
    stepOnce(loop, { moveX: 1 });
    return;
  }
  const safeDistance = target.enemyKind === 'nullPointerException' ? 285 : 260;
  if (distance < safeDistance) {
    const retreat: -1 | 1 = dir === 1 ? -1 : 1;
    // 近距离先保持枪口朝向目标，再边后退边开火，给近战敌人留下
    // 追击距离，同时仍然使用真实的攻击冷却和弹丸碰撞。
    if (canShoot(loop) && player.facing === dir) {
      stepOnce(loop, { moveX: retreat, attackPressed: true });
    } else {
      stepAdvance(loop, retreat, 18);
    }
    return;
  }
  if (
    canShoot(loop) &&
    distance <= SIM.projectileMaxDistance - 36 &&
    loop.state.match === 'playing'
  ) {
    stepOnce(loop, { attackPressed: true });
    return;
  }
  stepAdvance(loop, dir, 22);
}

function clearUpperTarget(
  loop: GameLoop,
  target: GameLoop['state']['enemies'][number],
): void {
  const player = loop.state.player;
  const dx = target.position.x - player.position.x;
  const distance = Math.abs(dx);
  const dir: -1 | 1 = dx < 0 ? -1 : 1;
  // 先走到目标平台附近，再从平台底部穿上去。平台底面是可穿透的，
  // 不使用侧向硬挤，避免把“上方目标”误判成空气墙。
  if (distance > 150) {
    stepAdvance(loop, dir, 22);
    return;
  }

  const projectileClearOfPlatform = player.position.y <= target.position.y + 26;
  const projectileCanReachTarget =
    player.position.y >= target.position.y - 38 && projectileClearOfPlatform;
  const jumpPressed = player.grounded && !projectileCanReachTarget;
  const jumpHeld = jumpPressed || !player.grounded;
  stepOnce(loop, {
    moveX: 0,
    jumpPressed,
    jumpHeld,
    attackPressed: canShoot(loop) && projectileCanReachTarget,
  });
}

/** 站定射击，直到谓词覆盖的敌人全部倒下。 */
function shootUntil(loop: GameLoop, pending: (enemy: GameLoop['state']['enemies'][number]) => boolean): void {
  let guard = 0;
  while (loop.state.enemies.some((enemy) => enemy.health > 0 && pending(enemy)) && guard < 4000) {
    guard += 1;
    const player = loop.state.player;
    const target = loop.state.enemies
      .filter((enemy) => enemy.health > 0 && pending(enemy))
      .reduce((best, enemy) =>
        Math.abs(enemy.position.x - player.position.x) <
        Math.abs(best.position.x - player.position.x)
          ? enemy
          : best,
      );
    const threat = loop.state.enemies.some(
      (enemy) =>
        enemy.health > 0 &&
        enemy.position.y === 440 &&
        Math.abs(enemy.position.x - player.position.x) < 260,
    );
    if (player.health < 75 && threat && loop.state.match === 'playing') {
      const nearest = loop.state.enemies.reduce((best, enemy) =>
        Math.abs(enemy.position.x - player.position.x) < Math.abs(best.position.x - player.position.x)
          ? enemy
          : best,
      );
      stepAdvance(loop, player.position.x < nearest.position.x ? -1 : 1, 22);
      continue;
    }
    if (player.position.x < 520 && player.health > 0 && loop.state.match === 'playing') {
      stepAdvance(loop, 1, 22);
      continue;
    }
    const dx = target.position.x - player.position.x;
    const dir: -1 | 1 = dx < 0 ? -1 : 1;
    const approachingGap =
      player.grounded &&
      player.position.y === 440 &&
      (crossesGroundGap(loop, player.position.x, player.position.x + dir * 36) ||
        !groundAt(loop, player.position.x + dir * 22));
    const canJumpNow = player.attackPhase === 'none' && player.locomotion !== 'hurt';
    if (approachingGap && !canJumpNow) {
      stepOnce(loop);
      continue;
    }
    if (approachingGap) {
      // 跳跃优先于开火，贴着坑边起跳，避免跳早了掉进短坑。
      stepAdvance(loop, dir, 22);
    } else if (target.position.y < player.position.y - 24 && loop.state.match === 'playing') {
      if (Math.abs(dx) > 220) stepAdvance(loop, dir, 22);
      else if (Math.abs(dx) < 140) stepAdvance(loop, dx > 0 ? -1 : 1, 22);
      else {
        stepOnce(loop, {
          moveX: 0,
          jumpPressed: player.grounded,
          jumpHeld: true,
          attackPressed: player.position.y < target.position.y + 50 && canShoot(loop),
        });
      }
    } else if (Math.abs(dx) < 70 && loop.state.match === 'playing') {
      stepAdvance(loop, dx > 0 ? -1 : 1, 22);
    } else if (canShoot(loop) && Math.abs(dx) < SIM.projectileMaxDistance - 40 && loop.state.match === 'playing') {
      // 在警戒距离之外射击，避免测试机器人被近战哨兵干扰。
      stepOnce(loop, { attackPressed: true });
    } else {
      stepAdvance(loop, dx < 0 ? -1 : 1);
    }
  }
}

function runKindChecks(): void {
  const loop = new GameLoop();
  const kinds = new Set(loop.state.enemies.map((enemy) => enemy.enemyKind));
  const supported = loop.state.enemies.every((enemy) =>
    loop.state.platforms.some(
      (platform) =>
        enemy.position.y === platform.y &&
        enemy.position.x >= platform.x &&
        enemy.position.x <= platform.x + platform.w,
    ),
  );
  const aerial = loop.state.enemies.filter((enemy) => enemy.position.y < 400);
  check(
    '四种敌人都站在平台上',
    kinds.has('syntaxError') &&
      kinds.has('nullPointerException') &&
      kinds.has('stackOverflowError') &&
      kinds.has('runtimeGlitch') &&
      supported &&
      aerial.length >= 2,
    `kinds=${[...kinds].join(',')} aerial=${aerial.length}`,
  );

  const glitch = loop.state.enemies.find((enemy) => enemy.enemyKind === 'runtimeGlitch')!;
  let guard = 0;
  while (Math.abs(loop.state.player.position.x - glitch.position.x) > 120 && guard < 900) {
    guard += 1;
    stepAdvance(loop, loop.state.player.position.x < glitch.position.x ? 1 : -1, 22);
    if (loop.state.match !== 'playing') break;
  }
  // S5 起瞬移接闪现斩，靠近途中可能已经把第一次瞬移用掉。
  // 重置冷却并把玩家摆到 100px 外，单独观察一次完整瞬移。
  glitch.blinkCooldownFrames = 0;
  glitch.attackCooldownFrames = 0;
  glitch.hurtFrames = 0;
  glitch.attackPhase = 'none';
  loop.state.player.position.x = glitch.position.x + 100;
  loop.state.player.position.y = glitch.position.y;
  loop.state.player.velocity.x = 0;
  loop.state.player.velocity.y = 0;
  loop.state.player.hurtFrames = 0;
  loop.state.player.invulnFrames = 999;
  const before = glitch.position.x;
  let blinked = false;
  for (let i = 0; i < 40; i++) {
    stepOnce(loop);
    if (Math.abs(glitch.position.x - before) > 40) {
      blinked = true;
      break;
    }
  }
  const cooled = glitch.blinkCooldownFrames > 0;
  const locked = glitch.position.x;
  for (let i = 0; i < 12; i++) stepOnce(loop);
  check(
    'RuntimeGlitch 瞬移有冷却',
    blinked && cooled && Math.abs(glitch.position.x - locked) < 30,
    `dx=${(glitch.position.x - before).toFixed(1)} cool=${glitch.blinkCooldownFrames}`,
  );
}

function runSentinelChecks(): void {
  {
    const loop = new GameLoop();
    const enemy = loop.state.enemies[0];
    const x0 = enemy.position.x;
    let turned = false;
    for (let i = 0; i < 240; i++) {
      stepOnce(loop);
      if (enemy.facing === 1 && enemy.position.x >= enemy.patrolMinX) turned = true;
    }
    check(
      '巡逻转向',
      enemy.behavior === 'patrol' && enemy.position.x !== x0 && turned && enemy.position.x >= enemy.patrolMinX,
      `x ${x0} → ${enemy.position.x.toFixed(1)} facing=${enemy.facing} behavior=${enemy.behavior}`,
    );
  }

  {
    const loop = new GameLoop();
    const enemy = loop.state.enemies[0];
    let guard = 0;
    while (Math.abs(enemy.position.x - loop.state.player.position.x) > enemy.alertRange - 30 && guard < 400) {
      guard += 1;
      stepAdvance(loop, 1);
    }
    let chased = false;
    for (let i = 0; i < 80; i++) {
      stepOnce(loop);
      if (enemy.behavior === 'chase') chased = true;
    }
    check('进入警戒后追击', chased, `behavior=${enemy.behavior}`);
  }

  {
    const loop = new GameLoop();
    const elevated = loop.state.enemies[0];
    for (let i = 0; i < 600; i++) stepOnce(loop);
    const onPlat =
      elevated.position.y === elevated.support.y &&
      elevated.position.x >= elevated.support.x &&
      elevated.position.x <= elevated.support.x + elevated.support.w;
    check(
      '哨兵不掉出平台',
      onPlat,
      `x=${elevated.position.x.toFixed(1)} y=${elevated.position.y}`,
    );
  }

  {
    const loop = new GameLoop();
    const victim = loop.state.enemies[0];
    let shots = 0;
    while (victim.health > 0 && loop.state.match === 'playing' && shots < 400) {
      shots += 1;
      if (canShoot(loop)) stepOnce(loop, { attackPressed: true });
      else stepOnce(loop);
    }
    const dead = loop.state.enemies.filter((enemy) => enemy.health <= 0);
    const still = dead.every((enemy) => enemy.behavior === 'dead' && enemy.attackPhase === 'none');
    check(
      '地面哨兵死亡后不再攻击',
      dead.length >= 1 && still,
      `dead=${dead.map((enemy) => enemy.behavior).join(',')}`,
    );
    const fresh = new GameLoop();
    stepOnce(fresh);
    check(
      '未清完时出口仍锁定',
      !fresh.state.level.exitUnlocked && fresh.state.enemies.some((enemy) => enemy.health > 0),
      `exit=${fresh.state.level.exitUnlocked}`,
    );
  }

  {
    const loop = new GameLoop();
    clearAll(loop);
    const unlocked = loop.state.level.exitUnlocked;
    let guard = 0;
    while (loop.state.match === 'playing' && guard < 2600) {
      guard += 1;
      if (loop.state.player.position.x < loop.state.exit.x + 12) stepAdvance(loop, 1);
      else stepOnce(loop);
    }
    check(
      '清敌后出口解锁并完成关卡',
      unlocked && loop.state.match === 'levelCleared',
      `exit=${loop.state.level.exitUnlocked} match=${loop.state.match} x=${loop.state.player.position.x.toFixed(1)} y=${loop.state.player.position.y.toFixed(1)} frame=${loop.state.frame} hp=${loop.state.enemies.map((e) => e.health).join(',')}`,
    );

    stepOnce(loop, { restartPressed: true });
    check(
      '重置恢复关卡',
      loop.state.match === 'playing' &&
        !loop.state.level.exitUnlocked &&
        loop.state.enemies.every((enemy) => enemy.health === enemy.maxHealth) &&
        loop.state.player.health === SIM.playerMaxHealth,
      `match=${loop.state.match} exit=${loop.state.level.exitUnlocked}`,
    );
  }
}

function landToward(loop: GameLoop, id: string): boolean {
  const ledge = loop.state.platforms.find((p) => p.id === id) as PlatformRect;
  const innerLeft = ledge.x + 24;
  const innerRight = ledge.x + ledge.w - 24;
  const center = ledge.x + ledge.w / 2;
  let jumped = false;
  for (let i = 0; i < 800; i++) {
    const player = loop.state.player;
    if (player.grounded && player.position.y === ledge.y) return true;
    const moveX: -1 | 1 = player.position.x < center ? 1 : -1;
    const inZone = player.position.x >= innerLeft && player.position.x <= innerRight;
    const next = player.position.x + moveX * 28;
    const gap = player.grounded && !hasFloor(loop, next, player.position.y);
    const startJump =
      !jumped && player.grounded && player.position.y > ledge.y && inZone;
    stepOnce(loop, {
      moveX,
      jumpPressed: startJump || gap,
      jumpHeld: jumped || startJump || gap || player.velocity.y < 0,
    });
    if (startJump) jumped = true;
  }
  return loop.state.player.position.y === ledge.y && loop.state.player.grounded;
}

/** 走到平台水平范围内后按住空格完整起跳，脚底应落在顶面。 */
function landOnLedge(id: string): void {
  const loop = new GameLoop();
  const ledge = loop.state.platforms.find((p) => p.id === id) as PlatformRect;
  if (ledge.x > 400) shootUntil(loop, (enemy) => enemy.position.y >= 400);
  const innerLeft = ledge.x + 36;
  const innerRight = ledge.x + ledge.w - 36;
  const center = ledge.x + ledge.w / 2;
  let jumped = false;
  let earlyLand = false;
  let landed = false;

  for (let i = 0; i < 700 && !landed; i++) {
    const player = loop.state.player;
    const moveX: -1 | 1 = player.position.x < center ? 1 : -1;
    const inZone = player.position.x >= innerLeft && player.position.x <= innerRight;
    const approaching = player.position.x > ledge.x - 70 && player.position.x < ledge.x + 20;
    const startJump =
      !jumped && player.grounded && player.position.y > ledge.y && (inZone || approaching);
    stepOnce(loop, {
      moveX,
      jumpPressed: startJump,
      jumpHeld: jumped || startJump,
    });
    if (startJump) jumped = true;

    const next = loop.state.player;
    if (jumped && next.velocity.y < 0 && next.grounded && next.position.y === ledge.y) {
      earlyLand = true;
    }
    if (
      jumped &&
      next.grounded &&
      next.velocity.y === 0 &&
      next.position.y === ledge.y
    ) {
      landed = true;
    }
  }

  const player = loop.state.player;
  check(
    `落到 ${id}`,
    landed &&
      !earlyLand &&
      player.position.y === ledge.y &&
      player.grounded &&
      player.velocity.y === 0,
    `landed=${landed} early=${earlyLand} x=${player.position.x.toFixed(1)} y=${player.position.y} grounded=${player.grounded} vy=${player.velocity.y}`,
  );
}

/** 测试辅助：同步 hurtbox，便于构造压在玩家身上的弹丸 */
function syncHurtForTest(loop: GameLoop): void {
  const p = loop.state.player;
  p.hurtbox = {
    x: p.position.x - p.width / 2,
    y: p.position.y - p.height,
    w: p.width,
    h: p.height,
  };
}

main();

function runS1LevelPointerChecks(): void {
  const initial = createInitialState();
  check(
    '初始关卡指针与敌人数量',
    initial.levelIndex === 0 && initial.enemies.length === LEVELS[0].enemies.length,
    `levelIndex=${initial.levelIndex} enemies=${initial.enemies.length} 期望=${LEVELS[0].enemies.length}`,
  );

  const loop = new GameLoop();
  // S6 起有第二关：这条断言针对「最后一关」，先载到最后一关再测
  loadLevel(loop.state, LEVELS.length - 1);
  loop.state.clearFrames = 1;
  loop.state.match = 'levelCleared';
  stepOnce(loop);
  // 主人要求：最后一关通关后转场回第一关，循环游玩
  check(
    '最后一关通关后转场回第一关',
    loop.state.match === 'transitioning' && loop.state.clearFrames === 0,
    `match=${loop.state.match} clearFrames=${loop.state.clearFrames}`,
  );
  stepFrames(loop, 61);
  check(
    '转场结束后回到第一关',
    loop.state.levelIndex === 0 && loop.state.match === 'playing',
    `levelIndex=${loop.state.levelIndex} match=${loop.state.match}`,
  );

  const levelIndex = loop.state.levelIndex;
  for (const enemy of loop.state.enemies) {
    enemy.health = 1;
  }
  loop.state.player.slowFrames = 8;
  resetGameState(loop.state);
  check(
    '重开当前关保留关卡指针并回满',
    loop.state.levelIndex === levelIndex &&
      loop.state.enemies.every((enemy) => enemy.health === enemy.maxHealth) &&
      loop.state.player.slowFrames === 0,
    `levelIndex=${loop.state.levelIndex} 期望=${levelIndex} slowFrames=${loop.state.player.slowFrames} 血量=${loop.state.enemies.map((enemy) => enemy.health).join(',')}`,
  );

  if (failures.length > 0) {
    process.exitCode = 1;
    throw new Error(`模拟验证失败：${failures.join('、')}`);
  }
}

runS1LevelPointerChecks();

/** S2：近战判定盒按 kind、多段攻击、攻击打断 */
function runS2CombatInfraChecks(): void {
  // 1. syntaxError / stackOverflowError 进入 active 时 hitbox !== null
  {
    const loop = new GameLoop();
    const syntax = loop.state.enemies.find((e) => e.enemyKind === 'syntaxError');
    const stack = loop.state.enemies.find((e) => e.enemyKind === 'stackOverflowError');
    if (!syntax || !stack) {
      check('近战 active 时 hitbox 非空', false, '找不到 syntaxError 或 stackOverflowError');
    } else {
      loop.state.player.position.x = 40;
      loop.state.player.invulnFrames = 999;
      for (const enemy of [syntax, stack]) {
        enemy.attackPhase = 'active';
        enemy.attackFramesLeft = enemy.attackActiveFrames;
        enemy.behavior = 'attack';
        enemy.hitApplied = false;
        enemy.hurtFrames = 0;
      }
      stepOnce(loop);
      check(
        '近战 active 时 hitbox 非空',
        syntax.hitbox !== null && stack.hitbox !== null,
        `syntax=${syntax.hitbox !== null} stack=${stack.hitbox !== null} phaseS=${syntax.attackPhase} phaseO=${stack.attackPhase}`,
      );
    }
  }

  // 2. nullPointerException 的 hitbox 恒为 null（即使 attackPhase = active）
  {
    const loop = new GameLoop();
    const npe = loop.state.enemies.find((e) => e.enemyKind === 'nullPointerException');
    if (!npe) {
      check('远程敌人 hitbox 恒为 null', false, '找不到 nullPointerException');
    } else {
      npe.attackPhase = 'active';
      npe.attackFramesLeft = 4;
      npe.behavior = 'attack';
      stepOnce(loop);
      const afterStep = npe.hitbox;
      npe.attackPhase = 'active';
      npe.behavior = 'attack';
      // 再推几帧，确认 active 全程仍为 null
      let alwaysNull = afterStep === null;
      for (let i = 0; i < 8; i++) {
        npe.attackPhase = 'active';
        npe.attackFramesLeft = 2;
        npe.behavior = 'attack';
        stepOnce(loop);
        if (npe.hitbox !== null) alwaysNull = false;
      }
      check(
        '远程敌人 hitbox 恒为 null',
        alwaysNull && afterStep === null,
        `afterStep=${afterStep} alwaysNull=${alwaysNull} meleeW=${npe.meleeW}`,
      );
    }
  }

  // 3–4. comboSegments = 2：第一段 active 后进 startup 且 comboIndex === 1；第二段 active 后才进 recovery
  {
    const loop = new GameLoop();
    const enemy = loop.state.enemies.find((e) => e.enemyKind === 'syntaxError');
    if (!enemy) {
      check('多段攻击第一段后回 startup', false, '找不到 syntaxError');
      check('多段攻击第二段后进 recovery', false, '找不到 syntaxError');
    } else {
      enemy.comboSegments = 2;
      enemy.comboStartupFrames = 3;
      enemy.attackStartupFrames = 5;
      enemy.attackActiveFrames = 2;
      enemy.attackRecoveryFrames = 4;
      enemy.comboIndex = 0;
      enemy.dashFrames = 0;
      dashSafe(enemy);
      enemy.attackPhase = 'startup';
      enemy.attackFramesLeft = enemy.attackStartupFrames;
      enemy.behavior = 'attack';
      enemy.hitApplied = false;
      enemy.attackCooldownFrames = 999;
      enemy.hurtFrames = 0;
      enemy.invulnFrames = 0;
      // 拉远玩家，避免近战命中触发 hit-stop 打乱帧计数
      loop.state.player.position.x = enemy.position.x + 2000;
      loop.state.player.invulnFrames = 999;

      // 走完第一段 startup + active → 应进入第二段 startup
      stepFrames(loop, enemy.attackStartupFrames + enemy.attackActiveFrames);
      check(
        '多段攻击第一段后回 startup',
        enemy.attackPhase === 'startup' && enemy.comboIndex === 1,
        `phase=${enemy.attackPhase} comboIndex=${enemy.comboIndex} framesLeft=${enemy.attackFramesLeft}`,
      );

      // 再走完第二段 startup + active → 才进 recovery
      const segmentStartup =
        enemy.comboStartupFrames > 0
          ? enemy.comboStartupFrames
          : enemy.attackStartupFrames;
      stepFrames(loop, segmentStartup + enemy.attackActiveFrames);
      check(
        '多段攻击第二段后进 recovery',
        enemy.attackPhase === 'recovery' && enemy.comboIndex === 1,
        `phase=${enemy.attackPhase} comboIndex=${enemy.comboIndex} framesLeft=${enemy.attackFramesLeft}`,
      );
    }
  }

  // 5. 第一段 startup 期间被玩家弹丸打中 → comboIndex 回 0，且不会继续第二段
  {
    const loop = new GameLoop();
    const enemy = loop.state.enemies.find((e) => e.enemyKind === 'syntaxError');
    if (!enemy) {
      check('连击打断后不进第二段', false, '找不到 syntaxError');
    } else {
      enemy.comboSegments = 2;
      enemy.comboStartupFrames = 6;
      enemy.attackStartupFrames = 10;
      enemy.attackActiveFrames = 4;
      enemy.attackRecoveryFrames = 8;
      enemy.comboIndex = 0;
      enemy.dashFramesLeft = 5;
      enemy.attackPhase = 'startup';
      enemy.attackFramesLeft = enemy.attackStartupFrames;
      enemy.behavior = 'attack';
      enemy.hitApplied = false;
      enemy.attackCooldownFrames = 999;
      enemy.hurtFrames = 0;
      enemy.invulnFrames = 0;
      enemy.health = enemy.maxHealth;
      loop.state.player.position.x = enemy.position.x - 80;
      loop.state.player.position.y = enemy.position.y;

      syncHurtForTest(loop);
      enemy.hurtbox = {
        x: enemy.position.x - enemy.width / 2,
        y: enemy.position.y - enemy.height,
        w: enemy.width,
        h: enemy.height,
      };
      const box = enemy.hurtbox;
      const proj: ProjectileState = {
        id: 9001,
        ownerId: 'player',
      gravity: 0,
      spawnFragmentOnLand: false,
        x: box.x + box.w / 2,
        y: box.y + box.h / 2,
        vx: 0,
        vy: 0,
        radius: SIM.projectileRadius,
        damage: 1,
        lifetimeFrames: 30,
        originX: box.x + box.w / 2,
        originY: box.y + box.h / 2,
        travelDistance: 0,
        maxDistance: SIM.projectileMaxDistance,
        alive: true,
      };
      loop.state.projectiles.push(proj);
      resolveProjectileHits(loop.state);

      const interrupted =
        enemy.comboIndex === 0 &&
        enemy.dashFramesLeft === 0 &&
        enemy.attackPhase === 'none' &&
        enemy.behavior === 'hurt';

      // 等待 hurt 结束，确认不会自行走进第二段（comboIndex 仍为 0，且不会出现 comboIndex===1）
      let sawSecondSegment = false;
      for (let i = 0; i < 120; i++) {
        stepOnce(loop);
        if (enemy.comboIndex === 1) sawSecondSegment = true;
        // 防止它因靠近玩家重新开刀：拉远并锁冷却
        enemy.attackCooldownFrames = 999;
        loop.state.player.position.x = enemy.position.x + 2000;
      }

      check(
        '连击打断后不进第二段',
        interrupted && !sawSecondSegment && enemy.comboIndex === 0,
        `interrupted=${interrupted} sawSecond=${sawSecondSegment} comboIndex=${enemy.comboIndex} phase=${enemy.attackPhase}`,
      );
    }
  }

  if (failures.length > 0) {
    process.exitCode = 1;
    throw new Error(`模拟验证失败：${failures.join('、')}`);
  }

  console.log('S2 战斗基础设施验证通过。');
}

/** 测试辅助：确保突进字段不干扰现有帧推进 */
function dashSafe(enemy: { dashFrames: number; dashFramesLeft: number; dashSpeed: number }): void {
  enemy.dashFrames = 0;
  enemy.dashFramesLeft = 0;
  enemy.dashSpeed = 0;
}

runS2CombatInfraChecks();

/** 把除目标外的敌人按进硬直，避免干扰，不改关卡数据。 */
function parkOtherEnemies(loop: GameLoop, keepId: string): void {
  for (const enemy of loop.state.enemies) {
    if (enemy.id === keepId) continue;
    enemy.hurtFrames = 99999;
    enemy.velocity.x = 0;
    enemy.velocity.y = 0;
  }
}

/** S3：syntaxError 突进二连斩 */
function runS3SyntaxDashChecks(): void {
  // 1. 水平距离 150、同高度、冷却 0、grounded → 一步后进入 startup 且正在突进
  {
    const loop = new GameLoop();
    const enemy = loop.state.enemies.find((e) => e.enemyKind === 'syntaxError');
    if (!enemy) {
      check('syntaxError 中距离进入突进', false, '找不到 syntaxError');
    } else {
      parkOtherEnemies(loop, enemy.id);
      const player = loop.state.player;
      player.position.x = enemy.position.x - 150;
      player.position.y = enemy.position.y;
      player.velocity.x = 0;
      player.velocity.y = 0;
      player.grounded = true;
      player.invulnFrames = 0;
      player.hurtFrames = 0;
      enemy.hurtFrames = 0;
      enemy.attackCooldownFrames = 0;
      enemy.attackPhase = 'none';
      enemy.grounded = true;
      enemy.velocity.x = 0;
      stepOnce(loop);
      check(
        'syntaxError 中距离进入突进',
        enemy.attackPhase === 'startup' && enemy.dashFramesLeft > 0 && enemy.comboIndex === 0,
        `phase=${enemy.attackPhase} dashFramesLeft=${enemy.dashFramesLeft} comboIndex=${enemy.comboIndex} adx=${Math.abs(player.position.x - enemy.position.x).toFixed(1)}`,
      );
    }
  }

  // 2 + 4. 突进期间 x 单调靠近，不越过 support 半宽边界；全程 y 不变
  {
    const loop = new GameLoop();
    const enemy = loop.state.enemies.find((e) => e.enemyKind === 'syntaxError');
    if (!enemy) {
      check('syntaxError 突进靠近且不越界', false, '找不到 syntaxError');
      check('syntaxError 突进全程高度不变', false, '找不到 syntaxError');
    } else {
      parkOtherEnemies(loop, enemy.id);
      const player = loop.state.player;
      player.position.x = enemy.position.x - 150;
      player.position.y = enemy.position.y;
      player.velocity.x = 0;
      player.velocity.y = 0;
      player.grounded = true;
      player.invulnFrames = 999;
      enemy.hurtFrames = 0;
      enemy.attackCooldownFrames = 0;
      enemy.attackPhase = 'none';
      enemy.grounded = true;
      const half = enemy.width / 2;
      const minX = enemy.support.x + half;
      const maxX = enemy.support.x + enemy.support.w - half;
      const playerX = player.position.x;
      const y0 = enemy.position.y;
      stepOnce(loop);
      let prev = enemy.position.x;
      const startX = prev;
      let moved = 0;
      let mono = true;
      let bounds = prev >= minX && prev <= maxX;
      let yOk = enemy.position.y === y0;
      let guard = 0;
      while (enemy.attackPhase === 'startup' && guard < 40) {
        stepOnce(loop);
        guard += 1;
        const x = enemy.position.x;
        const prevDist = Math.abs(prev - playerX);
        const dist = Math.abs(x - playerX);
        if (dist > prevDist + 1e-4) mono = false;
        if (Math.abs(x - prev) > 1e-4) moved += 1;
        if (x < minX - 1e-4 || x > maxX + 1e-4) bounds = false;
        if (enemy.position.y !== y0) yOk = false;
        prev = x;
      }
      const closer = Math.abs(prev - playerX) < Math.abs(startX - playerX);
      check(
        'syntaxError 突进靠近且不越界',
        enemy.attackPhase === 'active' && mono && bounds && closer && moved === 11,
        `phase=${enemy.attackPhase} moved=${moved} mono=${mono} bounds=${bounds} closer=${closer} x ${startX.toFixed(1)}→${prev.toFixed(1)} 边界[${minX.toFixed(1)},${maxX.toFixed(1)}]`,
      );
      check(
        'syntaxError 突进全程高度不变',
        yOk && enemy.position.y === y0,
        `y0=${y0} y=${enemy.position.y}`,
      );
    }
  }

  // 3. 第一段 active 只扣 10 一次，第二段扣 14；段间把无敌清掉才能再受击
  {
    const loop = new GameLoop();
    const enemy = loop.state.enemies.find((e) => e.enemyKind === 'syntaxError');
    if (!enemy) {
      check('syntaxError 二连伤害前低后高', false, '找不到 syntaxError');
    } else {
      parkOtherEnemies(loop, enemy.id);
      const player = loop.state.player;
      player.position.x = enemy.position.x + 40;
      player.position.y = enemy.position.y;
      player.velocity.x = 0;
      player.velocity.y = 0;
      player.grounded = true;
      player.health = SIM.playerMaxHealth;
      player.invulnFrames = 0;
      player.hurtFrames = 0;
      player.locomotion = 'idle';
      enemy.hurtFrames = 0;
      enemy.attackCooldownFrames = 0;
      enemy.attackPhase = 'none';
      enemy.comboIndex = 0;
      enemy.grounded = true;
      enemy.health = enemy.maxHealth;

      let firstDrops = 0;
      let firstLoss = 0;
      let firstKnock = 0;
      let guard = 0;
      while (enemy.comboIndex === 0 && guard < 80) {
        const hpBefore = player.health;
        const phaseBefore = enemy.attackPhase;
        stepOnce(loop);
        guard += 1;
        if (
          player.health < hpBefore &&
          (phaseBefore === 'active' || enemy.attackPhase === 'active')
        ) {
          firstDrops += 1;
          firstLoss = hpBefore - player.health;
          firstKnock = player.velocity.x;
        }
      }

      player.invulnFrames = 0;
      let secondDrops = 0;
      let secondLoss = 0;
      let secondKnock = 0;
      guard = 0;
      while (
        enemy.attackPhase !== 'recovery' &&
        enemy.attackPhase !== 'none' &&
        guard < 50
      ) {
        player.invulnFrames = 0;
        player.hurtFrames = 0;
        player.position.x = enemy.position.x + enemy.facing * 40;
        player.position.y = enemy.position.y;
        player.velocity.x = 0;
        player.velocity.y = 0;
        player.grounded = true;
        if (player.locomotion === 'dead') player.locomotion = 'idle';
        const hpBefore = player.health;
        const phaseBefore = enemy.attackPhase;
        stepOnce(loop);
        guard += 1;
        if (
          player.health < hpBefore &&
          enemy.comboIndex >= 1 &&
          (phaseBefore === 'active' || enemy.attackPhase === 'active')
        ) {
          secondDrops += 1;
          secondLoss = hpBefore - player.health;
          secondKnock = player.velocity.x;
        }
      }

      const knock1 = enemy.facing * SIM.knockbackX;
      const knock2 = enemy.facing * SIM.knockbackX * 1.4;
      check(
        'syntaxError 二连伤害前低后高',
        firstDrops === 1 &&
          firstLoss === 10 &&
          secondDrops === 1 &&
          secondLoss === 14 &&
          secondLoss > firstLoss &&
          enemy.damage === 10 &&
          Math.abs(firstKnock - knock1) < 1e-6 &&
          Math.abs(secondKnock - knock2) < 1e-4,
        `drops=${firstDrops}/${secondDrops} loss=${firstLoss}/${secondLoss} damage=${enemy.damage} knock=${firstKnock.toFixed(2)}/${secondKnock.toFixed(2)} 期望 ${knock1}/${knock2} phase=${enemy.attackPhase} combo=${enemy.comboIndex}`,
      );
    }
  }

  // 5. 突进过程中被玩家弹丸打中，连击段号和突进帧都清零
  {
    const loop = new GameLoop();
    const enemy = loop.state.enemies.find((e) => e.enemyKind === 'syntaxError');
    if (!enemy) {
      check('syntaxError 突进被弹丸打断', false, '找不到 syntaxError');
    } else {
      parkOtherEnemies(loop, enemy.id);
      const player = loop.state.player;
      player.position.x = enemy.position.x - 150;
      player.position.y = enemy.position.y;
      player.velocity.x = 0;
      player.velocity.y = 0;
      player.grounded = true;
      player.invulnFrames = 999;
      enemy.hurtFrames = 0;
      enemy.attackCooldownFrames = 0;
      enemy.attackPhase = 'none';
      enemy.grounded = true;
      enemy.invulnFrames = 0;
      enemy.health = enemy.maxHealth;
      stepOnce(loop);
      let guard = 0;
      while (enemy.dashFramesLeft > enemy.dashFrames && enemy.attackPhase === 'startup' && guard < 20) {
        stepOnce(loop);
        guard += 1;
      }
      const dashBefore = enemy.dashFramesLeft;
      const comboBefore = enemy.comboIndex;
      syncHurtForTest(loop);
      enemy.hurtbox = {
        x: enemy.position.x - enemy.width / 2,
        y: enemy.position.y - enemy.height,
        w: enemy.width,
        h: enemy.height,
      };
      const box = enemy.hurtbox;
      const proj: ProjectileState = {
        id: 9101,
        ownerId: 'player',
      gravity: 0,
      spawnFragmentOnLand: false,
        x: box.x + box.w / 2,
        y: box.y + box.h / 2,
        vx: 0,
        vy: 0,
        radius: SIM.projectileRadius,
        damage: 1,
        lifetimeFrames: 30,
        originX: box.x + box.w / 2,
        originY: box.y + box.h / 2,
        travelDistance: 0,
        maxDistance: SIM.projectileMaxDistance,
        alive: true,
      };
      loop.state.projectiles.push(proj);
      resolveProjectileHits(loop.state);
      check(
        'syntaxError 突进被弹丸打断',
        dashBefore > 0 &&
          comboBefore === 0 &&
          enemy.comboIndex === 0 &&
          enemy.dashFramesLeft === 0 &&
          enemy.attackPhase === 'none',
        `beforeDash=${dashBefore} beforeCombo=${comboBefore} combo=${enemy.comboIndex} dash=${enemy.dashFramesLeft} phase=${enemy.attackPhase}`,
      );
    }
  }

  if (failures.length > 0) {
    process.exitCode = 1;
    throw new Error(`模拟验证失败：${failures.join('、')}`);
  }

  console.log('S3 syntaxError 突进二连斩验证通过。');
}

runS3SyntaxDashChecks();

/**
 * S3 验收追加：dashDelay 突进二连斩。
 * 直接摆位置再 step，不改第一关场地。上面已有断言一行不动。
 */
function runS3DashDelayAcceptance(): void {
  // 1. 同平台、水平相距 150、冷却 0 → 进入 attack 且 dashFramesLeft > 0
  {
    const loop = new GameLoop();
    const enemy = loop.state.enemies.find((e) => e.enemyKind === 'syntaxError');
    if (!enemy) {
      check('S3验收 中距离进入突进', false, '找不到 syntaxError');
    } else {
      parkOtherEnemies(loop, enemy.id);
      const player = loop.state.player;
      player.position.x = enemy.position.x - 150;
      player.position.y = enemy.position.y;
      player.velocity.x = 0;
      player.velocity.y = 0;
      player.grounded = true;
      player.health = SIM.playerMaxHealth;
      player.locomotion = 'idle';
      enemy.position.y = enemy.support.y;
      enemy.grounded = true;
      enemy.hurtFrames = 0;
      enemy.attackCooldownFrames = 0;
      enemy.attackPhase = 'none';
      enemy.velocity.x = 0;
      enemy.velocity.y = 0;
      const samePlatform =
        player.position.y === enemy.support.y &&
        player.position.x >= enemy.support.x &&
        player.position.x <= enemy.support.x + enemy.support.w;
      stepOnce(loop);
      check(
        'S3验收 中距离进入突进',
        samePlatform &&
          enemy.behavior === 'attack' &&
          enemy.attackPhase !== 'none' &&
          enemy.dashFramesLeft > 0 &&
          enemy.comboIndex === 0,
        `same=${samePlatform} behavior=${enemy.behavior} phase=${enemy.attackPhase} dashFramesLeft=${enemy.dashFramesLeft} combo=${enemy.comboIndex}`,
      );
    }
  }

  // 2 + 4. 突进期间 x 单调靠近，不越过 support；全程 y 不变。
  // 把敌人摆到支撑左缘附近，让水平突进会被边界拦住。
  {
    const loop = new GameLoop();
    const enemy = loop.state.enemies.find((e) => e.enemyKind === 'syntaxError');
    if (!enemy) {
      check('S3验收 突进单调靠近且不越界', false, '找不到 syntaxError');
      check('S3验收 突进全程高度不变', false, '找不到 syntaxError');
    } else {
      parkOtherEnemies(loop, enemy.id);
      const half = enemy.width / 2;
      const minX = enemy.support.x + half;
      const maxX = enemy.support.x + enemy.support.w - half;
      enemy.position.x = minX + 24;
      enemy.position.y = enemy.support.y;
      enemy.grounded = true;
      enemy.hurtFrames = 0;
      enemy.attackCooldownFrames = 0;
      enemy.attackPhase = 'none';
      enemy.velocity.x = 0;
      enemy.velocity.y = 0;
      const player = loop.state.player;
      player.position.x = enemy.position.x - 150;
      player.position.y = enemy.position.y;
      player.velocity.x = 0;
      player.velocity.y = 0;
      player.grounded = true;
      player.invulnFrames = 999;
      player.health = SIM.playerMaxHealth;
      const y0 = enemy.position.y;
      const playerX = player.position.x;
      stepOnce(loop);
      let prev = enemy.position.x;
      const startX = prev;
      let mono = true;
      let bounds = prev >= minX - 1e-4 && prev <= maxX + 1e-4;
      let yOk = enemy.position.y === y0;
      let movedCloser = false;
      let guard = 0;
      while (enemy.attackPhase === 'startup' && guard < 40) {
        stepOnce(loop);
        guard += 1;
        const x = enemy.position.x;
        const prevDist = Math.abs(prev - playerX);
        const dist = Math.abs(x - playerX);
        if (dist > prevDist + 1e-4) mono = false;
        if (dist + 1e-4 < prevDist) movedCloser = true;
        if (x < minX - 1e-4 || x > maxX + 1e-4) bounds = false;
        if (enemy.position.y !== y0 || enemy.velocity.y !== 0) yOk = false;
        prev = x;
      }
      const closer = Math.abs(prev - playerX) < Math.abs(startX - playerX);
      check(
        'S3验收 突进单调靠近且不越界',
        mono && bounds && closer && movedCloser && enemy.attackPhase === 'active',
        `phase=${enemy.attackPhase} mono=${mono} bounds=${bounds} closer=${closer} movedCloser=${movedCloser} x ${startX.toFixed(1)}→${prev.toFixed(1)} 边界[${minX.toFixed(1)},${maxX.toFixed(1)}]`,
      );
      check(
        'S3验收 突进全程高度不变',
        yOk && enemy.position.y === y0,
        `y0=${y0} y=${enemy.position.y} vy=${enemy.velocity.y}`,
      );
    }
  }

  // 3. 贴脸起手：第一段 active 只扣一次，第二段伤害更高
  {
    const loop = new GameLoop();
    const enemy = loop.state.enemies.find((e) => e.enemyKind === 'syntaxError');
    if (!enemy) {
      check('S3验收 二连只扣一次且后段更高', false, '找不到 syntaxError');
    } else {
      parkOtherEnemies(loop, enemy.id);
      const player = loop.state.player;
      player.position.x = enemy.position.x + 36;
      player.position.y = enemy.position.y;
      player.velocity.x = 0;
      player.velocity.y = 0;
      player.grounded = true;
      player.health = SIM.playerMaxHealth;
      player.invulnFrames = 0;
      player.hurtFrames = 0;
      player.locomotion = 'idle';
      enemy.hurtFrames = 0;
      enemy.attackCooldownFrames = 0;
      enemy.attackPhase = 'none';
      enemy.comboIndex = 0;
      enemy.dashFramesLeft = 0;
      enemy.dashDelayLeft = 0;
      enemy.grounded = true;
      enemy.health = enemy.maxHealth;

      let firstDrops = 0;
      let firstLoss = 0;
      let guard = 0;
      while (enemy.comboIndex === 0 && guard < 80) {
        const hpBefore = player.health;
        const phaseBefore = enemy.attackPhase;
        stepOnce(loop);
        guard += 1;
        if (
          player.health < hpBefore &&
          (phaseBefore === 'active' || enemy.attackPhase === 'active')
        ) {
          firstDrops += 1;
          firstLoss = hpBefore - player.health;
        }
      }

      let secondDrops = 0;
      let secondLoss = 0;
      guard = 0;
      while (enemy.attackPhase !== 'recovery' && enemy.attackPhase !== 'none' && guard < 40) {
        player.invulnFrames = 0;
        player.hurtFrames = 0;
        player.position.x = enemy.position.x + enemy.facing * 36;
        player.position.y = enemy.position.y;
        player.velocity.x = 0;
        player.velocity.y = 0;
        player.grounded = true;
        if (player.locomotion === 'dead' || player.locomotion === 'hurt') player.locomotion = 'idle';
        if (player.health <= 0) player.health = SIM.playerMaxHealth;
        const hpBefore = player.health;
        const phaseBefore = enemy.attackPhase;
        stepOnce(loop);
        guard += 1;
        if (
          player.health < hpBefore &&
          enemy.comboIndex > 0 &&
          (phaseBefore === 'active' || enemy.attackPhase === 'active')
        ) {
          secondDrops += 1;
          secondLoss = hpBefore - player.health;
        }
      }

      check(
        'S3验收 二连只扣一次且后段更高',
        firstDrops === 1 && secondDrops === 1 && secondLoss > firstLoss && firstLoss > 0,
        `drops=${firstDrops}/${secondDrops} loss=${firstLoss}/${secondLoss} phase=${enemy.attackPhase} combo=${enemy.comboIndex}`,
      );
    }
  }

  // 5. 突进中被弹丸打断：comboIndex 与 dashFramesLeft 都回到 0
  {
    const loop = new GameLoop();
    const enemy = loop.state.enemies.find((e) => e.enemyKind === 'syntaxError');
    if (!enemy) {
      check('S3验收 弹丸打断清空突进', false, '找不到 syntaxError');
    } else {
      parkOtherEnemies(loop, enemy.id);
      const player = loop.state.player;
      player.position.x = enemy.position.x - 150;
      player.position.y = enemy.position.y;
      player.velocity.x = 0;
      player.velocity.y = 0;
      player.grounded = true;
      player.invulnFrames = 999;
      player.health = SIM.playerMaxHealth;
      enemy.hurtFrames = 0;
      enemy.attackCooldownFrames = 0;
      enemy.attackPhase = 'none';
      enemy.grounded = true;
      enemy.invulnFrames = 0;
      enemy.health = enemy.maxHealth;
      stepOnce(loop);
      let guard = 0;
      while (
        !(enemy.dashFramesLeft > 0 && enemy.dashFramesLeft < enemy.dashFrames) &&
        enemy.attackPhase === 'startup' &&
        guard < 30
      ) {
        stepOnce(loop);
        guard += 1;
      }
      const dashBefore = enemy.dashFramesLeft;
      syncHurtForTest(loop);
      enemy.hurtbox = {
        x: enemy.position.x - enemy.width / 2,
        y: enemy.position.y - enemy.height,
        w: enemy.width,
        h: enemy.height,
      };
      const box = enemy.hurtbox;
      const proj: ProjectileState = {
        id: 9201,
        ownerId: 'player',
      gravity: 0,
      spawnFragmentOnLand: false,
        x: box.x + box.w / 2,
        y: box.y + box.h / 2,
        vx: 0,
        vy: 0,
        radius: SIM.projectileRadius,
        damage: 1,
        lifetimeFrames: 30,
        originX: box.x + box.w / 2,
        originY: box.y + box.h / 2,
        travelDistance: 0,
        maxDistance: SIM.projectileMaxDistance,
        alive: true,
      };
      loop.state.projectiles.push(proj);
      resolveProjectileHits(loop.state);
      check(
        'S3验收 弹丸打断清空突进',
        dashBefore > 0 &&
          enemy.comboIndex === 0 &&
          enemy.dashFramesLeft === 0 &&
          enemy.dashDelayLeft === 0 &&
          enemy.attackPhase === 'none',
        `beforeDash=${dashBefore} combo=${enemy.comboIndex} dash=${enemy.dashFramesLeft} delay=${enemy.dashDelayLeft} phase=${enemy.attackPhase}`,
      );
    }
  }

  if (failures.length > 0) {
    process.exitCode = 1;
    throw new Error(`模拟验证失败：${failures.join('、')}`);
  }

  console.log('S3 验收追加：突进二连斩通过。');
}

runS3DashDelayAcceptance();

type SimEnemy = GameLoop['state']['enemies'][number];

/** 玩家弹丸压在敌人身体中心上，直接结算，不推进一步（避免 hurtFrames 被递减）。 */
function strikeStackEnemy(loop: GameLoop, enemy: SimEnemy, id: number): void {
  syncHurtForTest(loop);
  enemy.invulnFrames = 0;
  enemy.health = enemy.maxHealth;
  const box = {
    x: enemy.position.x - enemy.width / 2,
    y: enemy.position.y - enemy.height,
    w: enemy.width,
    h: enemy.height,
  };
  enemy.hurtbox = box;
  const proj: ProjectileState = {
    id,
    ownerId: 'player',
      gravity: 0,
      spawnFragmentOnLand: false,
    x: box.x + box.w / 2,
    y: box.y + box.h / 2,
    vx: 0,
    vy: 0,
    radius: SIM.projectileRadius,
    damage: 1,
    lifetimeFrames: 30,
    originX: box.x + box.w / 2,
    originY: box.y + box.h / 2,
    travelDistance: 0,
    maxDistance: SIM.projectileMaxDistance,
    alive: true,
  };
  loop.state.projectiles.push(proj);
  resolveProjectileHits(loop.state);
}

/** 把玩家放回出生平台，避免掉坑或贴脸触发 hit-stop。 */
function parkPlayerFar(loop: GameLoop): void {
  const player = loop.state.player;
  player.position.x = 120;
  player.position.y = 440;
  player.velocity.x = 0;
  player.velocity.y = 0;
  player.grounded = true;
  player.health = SIM.playerMaxHealth;
  player.locomotion = 'idle';
  player.invulnFrames = 9999;
  player.hurtFrames = 0;
}

/**
 * 手动走完一段 startup+active，停在刚进入 recovery 的那一帧。
 * 调用前应已把 attackStartupFrames / attackActiveFrames 改短。
 */
function driveStackAttackToRecovery(loop: GameLoop, enemy: SimEnemy): void {
  dashSafe(enemy);
  enemy.dashFrames = 0;
  enemy.hurtFrames = 0;
  enemy.attackPhase = 'startup';
  enemy.attackFramesLeft = enemy.attackStartupFrames;
  enemy.behavior = 'attack';
  enemy.hitApplied = false;
  enemy.comboIndex = 0;
  enemy.attackCooldownFrames = 999;
  loop.state.hitStopFrames = 0;
  parkPlayerFar(loop);
  stepFrames(loop, enemy.attackStartupFrames + enemy.attackActiveFrames);
}

/** S4：stackOverflowError 叠层、满层 overflow、startup 打断。 */
function runS4StackOverflowChecks(): void {
  // 4 + 第五次 overflow：连续打完四次后层数为 4，下一击判定盒 150 宽且中心对齐
  {
    const loop = new GameLoop();
    const enemy = loop.state.enemies.find((e) => e.enemyKind === 'stackOverflowError');
    if (!enemy) {
      check('连续四次攻击后 stackDepth 为 4', false, '找不到 stackOverflowError');
      check('第五次攻击 overflow 且判定盒居中', false, '找不到 stackOverflowError');
    } else {
      parkOtherEnemies(loop, enemy.id);
      dashSafe(enemy);
      enemy.dashFrames = 0;
      enemy.attackStartupFrames = 2;
      enemy.attackActiveFrames = 2;
      enemy.attackRecoveryFrames = 2;
      enemy.stackDepth = 0;
      enemy.hurtFrames = 0;
      enemy.attackPhase = 'none';
      parkPlayerFar(loop);

      const depths: number[] = [];
      let enteredRecovery = true;
      for (let i = 0; i < 4; i++) {
        driveStackAttackToRecovery(loop, enemy);
        depths.push(enemy.stackDepth);
        if (enemy.attackPhase !== 'recovery' || loop.state.match !== 'playing') {
          enteredRecovery = false;
        }
      }
      check(
        '连续四次攻击后 stackDepth 为 4',
        enteredRecovery &&
          depths.length === 4 &&
          depths.every((depth, index) => depth === index + 1) &&
          enemy.stackDepth === 4,
        `depths=${depths.join(',')} phase=${enemy.attackPhase} match=${loop.state.match}`,
      );

      // 收招走完，玩家仍在远处，冷却锁住，避免第五击提前开始
      enemy.attackCooldownFrames = 999;
      loop.state.hitStopFrames = 0;
      parkPlayerFar(loop);
      stepFrames(loop, enemy.attackRecoveryFrames);

      const support = enemy.support;
      const enemyX = support.x + support.w / 2;
      enemy.position.x = enemyX;
      enemy.position.y = support.y;
      enemy.velocity.x = 0;
      enemy.velocity.y = 0;
      enemy.grounded = true;
      enemy.hurtFrames = 0;
      enemy.attackCooldownFrames = 0;
      enemy.attackPhase = 'none';
      enemy.behavior = 'chase';
      enemy.comboIndex = 0;
      dashSafe(enemy);
      enemy.dashFrames = 0;
      const player = loop.state.player;
      player.position.x = enemyX + 40;
      player.position.y = support.y;
      player.velocity.x = 0;
      player.velocity.y = 0;
      player.grounded = true;
      player.health = SIM.playerMaxHealth;
      player.locomotion = 'idle';
      player.hurtFrames = 0;
      player.invulnFrames = 9999;
      loop.state.hitStopFrames = 0;

      const ready =
        loop.state.match === 'playing' &&
        enemy.attackPhase === 'none' &&
        enemy.stackDepth === 4 &&
        Math.abs(player.position.x - enemy.position.x) < enemy.attackRange;
      stepOnce(loop);

      let sawOverflowVariant = enemy.attackPhase === 'startup' && enemy.attackVariant === 'overflow';
      let overflowBox = false;
      let boxDetail = `phase=${enemy.attackPhase} variant=${enemy.attackVariant}`;
      let guard = 0;
      while (guard < 40 && enemy.attackPhase !== 'recovery' && enemy.attackPhase !== 'none') {
        if (enemy.attackPhase === 'startup' && enemy.attackVariant === 'overflow') {
          sawOverflowVariant = true;
        }
        if (enemy.attackPhase === 'active' && enemy.hitbox !== null && enemy.attackVariant === 'overflow') {
          const centerX = enemy.hitbox.x + enemy.hitbox.w / 2;
          overflowBox =
            enemy.hitbox.w === 150 &&
            enemy.hitbox.h === 64 &&
            Math.abs(centerX - enemy.position.x) < 1e-6 &&
            enemy.stackDepth === 4;
          boxDetail = `w=${enemy.hitbox.w} h=${enemy.hitbox.h} center=${centerX} pos=${enemy.position.x} depth=${enemy.stackDepth}`;
          if (overflowBox) break;
        }
        stepOnce(loop);
        guard += 1;
      }
      check(
        '第五次攻击 overflow 且判定盒居中',
        ready && sawOverflowVariant && overflowBox,
        `ready=${ready} variant=${sawOverflowVariant} box=${overflowBox} ${boxDetail} guard=${guard}`,
      );
    }
  }

  // 5. startup 被玩家弹丸打中：层数归零，硬直 = hurtStunFrames + 30
  {
    const loop = new GameLoop();
    const enemy = loop.state.enemies.find((e) => e.enemyKind === 'stackOverflowError');
    if (!enemy) {
      check('startup 被弹丸打断后层数归零', false, '找不到 stackOverflowError');
    } else {
      parkOtherEnemies(loop, enemy.id);
      dashSafe(enemy);
      enemy.dashFrames = 0;
      parkPlayerFar(loop);
      enemy.stackDepth = 3;
      enemy.attackPhase = 'startup';
      enemy.attackFramesLeft = 8;
      enemy.behavior = 'attack';
      enemy.hurtFrames = 0;
      enemy.hitApplied = false;
      enemy.health = enemy.maxHealth;
      const depthBefore = enemy.stackDepth;
      const hpBefore = enemy.health;
      strikeStackEnemy(loop, enemy, 9301);
      check(
        'startup 被弹丸打断后层数归零',
        depthBefore === 3 &&
          enemy.health < hpBefore &&
          enemy.stackDepth === 0 &&
          enemy.hurtFrames === SIM.hurtStunFrames + 30 &&
          enemy.hurtFrames === 43,
        `before=${depthBefore} depth=${enemy.stackDepth} hurt=${enemy.hurtFrames} hp ${hpBefore}→${enemy.health} phase=${enemy.attackPhase}`,
      );
    }
  }

  // 6. recovery 被打中不清层数（打断只在 startup 生效）
  {
    const loop = new GameLoop();
    const enemy = loop.state.enemies.find((e) => e.enemyKind === 'stackOverflowError');
    if (!enemy) {
      check('recovery 被弹丸打中保留层数', false, '找不到 stackOverflowError');
    } else {
      parkOtherEnemies(loop, enemy.id);
      dashSafe(enemy);
      enemy.dashFrames = 0;
      parkPlayerFar(loop);
      enemy.stackDepth = 3;
      enemy.attackPhase = 'recovery';
      enemy.attackFramesLeft = 6;
      enemy.behavior = 'attack';
      enemy.hurtFrames = 0;
      enemy.hitApplied = false;
      enemy.health = enemy.maxHealth;
      const depthBefore = enemy.stackDepth;
      const hpBefore = enemy.health;
      strikeStackEnemy(loop, enemy, 9302);
      check(
        'recovery 被弹丸打中保留层数',
        depthBefore === 3 &&
          enemy.health < hpBefore &&
          enemy.stackDepth === depthBefore &&
          enemy.stackDepth !== 0,
        `before=${depthBefore} depth=${enemy.stackDepth} hurt=${enemy.hurtFrames} hp ${hpBefore}→${enemy.health} phase=${enemy.attackPhase}`,
      );
    }
  }

  if (failures.length > 0) {
    process.exitCode = 1;
    throw new Error(`模拟验证失败：${failures.join('、')}`);
  }

  console.log('S4 stackOverflowError 叠层验证通过。');
}

runS4StackOverflowChecks();

/** S5：runtimeGlitch 闪现斩 + 故障场 */
function runS5GlitchChecks(): void {
  // 1. 瞬移后 attackPhase === 'startup'（修掉「只追不打」），随后能真的把玩家打进 hurtFrames
  {
    const loop = new GameLoop();
    const enemy = loop.state.enemies.find((e) => e.enemyKind === 'runtimeGlitch');
    if (!enemy) {
      check('runtimeGlitch 瞬移后接闪现斩', false, '找不到 runtimeGlitch');
    } else {
      parkOtherEnemies(loop, enemy.id);
      const player = loop.state.player;
      player.position.x = enemy.position.x + 100;
      player.position.y = enemy.position.y;
      player.velocity.x = 0;
      player.velocity.y = 0;
      player.grounded = true;
      player.invulnFrames = 0;
      player.hurtFrames = 0;
      enemy.hurtFrames = 0;
      enemy.attackCooldownFrames = 0;
      enemy.blinkCooldownFrames = 0;
      enemy.attackPhase = 'none';
      enemy.behavior = 'patrol';
      stepOnce(loop);
      const enteredStartup = enemy.attackPhase === 'startup';
      let hurt = false;
      for (let i = 0; i < 40; i++) {
        stepOnce(loop);
        if (player.hurtFrames > 0 || player.health < player.maxHealth) {
          hurt = true;
          break;
        }
      }
      check(
        'runtimeGlitch 瞬移后接闪现斩',
        enteredStartup && hurt,
        `phase=${enemy.attackPhase} hurt=${hurt} hp=${player.health}`,
      );
    }
  }

  // 2. 瞬移落点（旧位置）生成故障场：radius 70、framesLeft 约 150
  {
    const loop = new GameLoop();
    const enemy = loop.state.enemies.find((e) => e.enemyKind === 'runtimeGlitch');
    if (!enemy) {
      check('瞬移落点生成故障场', false, '找不到 runtimeGlitch');
    } else {
      parkOtherEnemies(loop, enemy.id);
      const player = loop.state.player;
      player.position.x = enemy.position.x + 100;
      player.position.y = enemy.position.y;
      player.grounded = true;
      player.invulnFrames = 999;
      enemy.hurtFrames = 0;
      enemy.attackCooldownFrames = 0;
      enemy.blinkCooldownFrames = 0;
      enemy.attackPhase = 'none';
      const oldX = enemy.position.x;
      stepOnce(loop);
      const zone = loop.state.glitchZones[0];
      check(
        '瞬移落点生成故障场',
        zone !== undefined &&
          loop.state.glitchZones.length === 1 &&
          zone.x === oldX &&
          zone.radius === 70 &&
          zone.framesLeft >= 148,
        zone
          ? `count=${loop.state.glitchZones.length} x=${zone.x} 期望=${oldX} r=${zone.radius} frames=${zone.framesLeft}`
          : '没有生成故障场',
      );
    }
  }

  // 3. 同屏第 3 个 zone 出现时总数仍是 2（踢掉剩余帧数最少的）
  {
    const loop = new GameLoop();
    pushGlitchZone(loop.state, 100, 440);
    pushGlitchZone(loop.state, 200, 440);
    loop.state.glitchZones[0]!.framesLeft = 100;
    pushGlitchZone(loop.state, 300, 440);
    const frames = loop.state.glitchZones.map((z) => z.framesLeft).join(',');
    check(
      '同屏故障场最多 2 个',
      loop.state.glitchZones.length === 2 && !frames.includes('100'),
      `count=${loop.state.glitchZones.length} frames=${frames}`,
    );
  }

  // 4. 玩家站在 zone 内：slowFrames > 0，水平移速约为 260 × 0.55
  {
    const loop = new GameLoop();
    parkOtherEnemies(loop, 'none');
    const player = loop.state.player;
    pushGlitchZone(loop.state, player.position.x, player.position.y);
    stepOnce(loop, { moveX: 1 });
    stepOnce(loop, { moveX: 1 });
    const expected = SIM.moveSpeed * 0.55;
    check(
      '故障场内水平移速 ×0.55',
      player.slowFrames > 0 && Math.abs(player.velocity.x - expected) <= 2,
      `slow=${player.slowFrames} vx=${player.velocity.x.toFixed(1)} 期望=${expected}`,
    );
  }

  // 5. 故障场内起跳初速约为 jumpVelocity × 0.82
  {
    const loop = new GameLoop();
    parkOtherEnemies(loop, 'none');
    const player = loop.state.player;
    pushGlitchZone(loop.state, player.position.x, player.position.y);
    stepOnce(loop);
    stepOnce(loop, { jumpPressed: true, jumpHeld: true });
    // 起跳同一帧还会累积一次重力
    const expected = SIM.jumpVelocity * 0.82 + SIM.gravity * SIM.fixedDt;
    check(
      '故障场内起跳初速 ×0.82',
      player.slowFrames > 0 && Math.abs(player.velocity.y - expected) <= 2,
      `slow=${player.slowFrames} vy=${player.velocity.y.toFixed(1)} 期望=${expected.toFixed(1)}`,
    );
  }

  // 6. 走出 zone 后 slowFrames 在 20 帧内归零（把 zone 挪走，避免玩家掉坑）
  {
    const loop = new GameLoop();
    parkOtherEnemies(loop, 'none');
    const player = loop.state.player;
    pushGlitchZone(loop.state, player.position.x, player.position.y);
    stepOnce(loop);
    loop.state.glitchZones[0]!.x += 500;
    let frames = 0;
    while (player.slowFrames > 0 && frames < 30) {
      stepOnce(loop);
      frames += 1;
    }
    check(
      '走出故障场后 20 帧内减速消失',
      player.slowFrames === 0 && frames <= 20,
      `frames=${frames} slow=${player.slowFrames}`,
    );
  }

  // 7. zone 的 framesLeft 归零后从数组移除
  {
    const loop = new GameLoop();
    parkOtherEnemies(loop, 'none');
    pushGlitchZone(loop.state, loop.state.player.position.x + 300, 440);
    loop.state.glitchZones[0]!.framesLeft = 2;
    stepFrames(loop, 3);
    check(
      '故障场倒计时归零后移除',
      loop.state.glitchZones.length === 0,
      `count=${loop.state.glitchZones.length}`,
    );
  }

  if (failures.length > 0) {
    process.exitCode = 1;
    throw new Error(`模拟验证失败：${failures.join('、')}`);
  }

  console.log('S5 runtimeGlitch 闪现斩与故障场验证通过。');
}

runS5GlitchChecks();

/** S6：第二关数据与编队 */
function runS6Level2Checks(): void {
  const level2 = LEVELS[1];

  // 5. 关卡表长度与指针（S8 追加 Boss 房后 length 为 3，这里只锁定 level2 的位置）
  check(
    'LEVELS 有两关且 levelAt(1) 是 level2',
    LEVELS.length >= 2 && level2 !== undefined && level2.id === 'level2',
    `length=${LEVELS.length} id=${level2?.id}`,
  );
  if (!level2) return;

  // 1. 每个出生点都有支撑平台，x 在平台范围内、y 恰好是平台顶面
  {
    const bad: string[] = [];
    for (const spawn of level2.enemies) {
      try {
        const support = platformUnder(level2, spawn.x, spawn.y);
        if (spawn.x < support.x || spawn.x > support.x + support.w) {
          bad.push(`${spawn.id}:x 超出 ${support.id}`);
        }
      } catch {
        bad.push(`${spawn.id}:无支撑`);
      }
    }
    check(
      '第二关每个敌人出生点都有支撑平台',
      bad.length === 0,
      bad.length === 0 ? `enemies=${level2.enemies.length}` : bad.join('；'),
    );
  }

  // 2. 每只敌人的巡逻区间都落在脚下平台范围内
  {
    const bad: string[] = [];
    for (const spawn of level2.enemies) {
      const support = platformUnder(level2, spawn.x, spawn.y);
      if (
        spawn.patrolMinX < support.x ||
        spawn.patrolMaxX > support.x + support.w
      ) {
        bad.push(`${spawn.id}:${spawn.patrolMinX}-${spawn.patrolMaxX} 超出 ${support.id}[${support.x}-${support.x + support.w}]`);
      }
    }
    check(
      '第二关巡逻区间不越出平台',
      bad.length === 0,
      bad.length === 0 ? '全部在平台内' : bad.join('；'),
    );
  }

  // 3. 相邻地面之间的空隙宽度 ≤ 90（可跳过）
  {
    const grounds = level2.platforms
      .filter((p) => p.y === 440)
      .slice()
      .sort((a, b) => a.x - b.x);
    const gaps: number[] = [];
    for (let i = 0; i + 1 < grounds.length; i++) {
      gaps.push(grounds[i + 1]!.x - (grounds[i]!.x + grounds[i]!.w));
    }
    check(
      '第二关地面空隙都可跳过',
      gaps.every((gap) => gap <= 90),
      `gaps=${gaps.join(',')}`,
    );
  }

  // 4. l2-a-safe 宽 ≥ 130，且比 A 组两只 runtimeGlitch 的 y 小至少 100
  {
    const safe = level2.platforms.find((p) => p.id === 'l2-a-safe');
    const glitchYs = level2.enemies
      .filter((e) => e.id.startsWith('l2-a-glitch'))
      .map((e) => e.y);
    const ok =
      safe !== undefined &&
      safe.w >= 130 &&
      glitchYs.length === 2 &&
      glitchYs.every((y) => y - safe.y >= 100);
    check(
      'A 组安全台免疫故障场',
      ok,
      safe
        ? `w=${safe.w} y=${safe.y} glitchY=${glitchYs.join(',')}`
        : '找不到 l2-a-safe',
    );
  }

  if (failures.length > 0) {
    process.exitCode = 1;
    throw new Error(`模拟验证失败：${failures.join('、')}`);
  }

  console.log('S6 第二关数据验证通过。');
}

runS6Level2Checks();

/** S7：heapShot 抛物线弹 + 内存碎片 */
function runS7HeapChecks(): void {
  // 1. null 弹丸轨迹不变：gravity 为 0，vy 恒 0
  {
    const loop = new GameLoop();
    parkOtherEnemies(loop, 'none');
    loop.state.player.invulnFrames = 99999;
    const npe = loop.state.enemies.find((e) => e.enemyKind === 'nullPointerException')!;
    spawnNullProjectile(loop.state, npe);
    const shot = loop.state.projectiles[loop.state.projectiles.length - 1]!;
    let vyAlwaysZero = shot.vy === 0 && shot.gravity === 0;
    for (let i = 0; i < 10 && shot.alive; i++) {
      updateProjectiles(loop.state, SIM.fixedDt);
      if (shot.vy !== 0) vyAlwaysZero = false;
    }
    check('null 弹丸轨迹不变', vyAlwaysZero, `vy=${shot.vy} gravity=${shot.gravity}`);
  }

  // 2 + 3. heap 弹 vy 每帧增加 900×fixedDt，撞平台消失并生成碎片（health 10 / framesLeft 480）
  {
    const loop = new GameLoop();
    parkOtherEnemies(loop, 'none');
    loop.state.player.invulnFrames = 99999;
    const enemy = loop.state.enemies[0]!;
    // 挪到出口缓冲区（2010–2190 上方没有悬空平台），避免上升段撞到台子底部
    enemy.position.x = 2050;
    enemy.position.y = 440;
    spawnHeapShot(loop.state, enemy, enemy.position.x + 300);
    const shot = loop.state.projectiles[loop.state.projectiles.length - 1]!;
    const vy0 = shot.vy;
    updateProjectiles(loop.state, SIM.fixedDt);
    const vyStep = shot.vy - vy0;
    let guard = 0;
    while (shot.alive && guard < 240) {
      updateProjectiles(loop.state, SIM.fixedDt);
      guard += 1;
    }
    const fragment = loop.state.fragments[0];
    check(
      'heap 弹抛物线且落地消失',
      Math.abs(vyStep - 900 * SIM.fixedDt) < 1e-9 && !shot.alive && guard < 240,
      `vyStep=${vyStep} 期望=${900 * SIM.fixedDt} alive=${shot.alive} frames=${guard}`,
    );
    check(
      'heap 弹落地生成碎片',
      fragment !== undefined &&
        loop.state.fragments.length === 1 &&
        fragment.health === 10 &&
        fragment.framesLeft === 480,
      fragment
        ? `count=${loop.state.fragments.length} hp=${fragment.health} frames=${fragment.framesLeft} y=${fragment.y}`
        : '没有生成碎片',
    );
  }

  // 4. 玩家弹丸命中碎片掉血，且不会穿透碎片打到后面的敌人
  {
    const loop = new GameLoop();
    parkOtherEnemies(loop, 'none');
    const enemy = loop.state.enemies[0]!;
    enemy.hurtFrames = 0;
    spawnHeapFragment(loop.state, enemy.position.x - 40, enemy.position.y);
    const fragment = loop.state.fragments[0]!;
    const proj: ProjectileState = {
      id: 9301,
      ownerId: 'player',
      gravity: 0,
      spawnFragmentOnLand: false,
      x: fragment.x,
      y: fragment.y,
      vx: 100,
      vy: 0,
      radius: SIM.projectileRadius,
      damage: 30,
      lifetimeFrames: 30,
      originX: fragment.x,
      originY: fragment.y,
      travelDistance: 0,
      maxDistance: SIM.projectileMaxDistance,
      alive: true,
    };
    loop.state.projectiles.push(proj);
    const hpBefore = enemy.health;
    resolveProjectileHits(loop.state);
    check(
      '玩家弹丸先打碎片不穿透',
      fragment.health === 0 &&
        !fragment.alive &&
        !proj.alive &&
        enemy.health === hpBefore,
      `fragHp=${fragment.health} fragAlive=${fragment.alive} projAlive=${proj.alive} 敌血 ${hpBefore}→${enemy.health}`,
    );
  }

  // 5. 碎片 framesLeft 归零后从数组移除
  {
    const loop = new GameLoop();
    spawnHeapFragment(loop.state, 500, 440);
    loop.state.fragments[0]!.framesLeft = 1;
    updateHeapFragments(loop.state);
    check(
      '碎片倒计时归零后移除',
      loop.state.fragments.length === 0,
      `count=${loop.state.fragments.length}`,
    );
  }

  if (failures.length > 0) {
    process.exitCode = 1;
    throw new Error(`模拟验证失败：${failures.join('、')}`);
  }

  console.log('S7 heapShot 与内存碎片验证通过。');
}

runS7HeapChecks();

/** S8：Boss P1（LEAK）+ P2（GC PAUSE） */
function runS8BossChecks(): void {
  const bossLevelIndex = LEVELS.length - 1;
  const findBoss = (loop: GameLoop) =>
    loop.state.enemies.find((e) => e.enemyKind === 'outOfMemoryError');

  // 1. Boss 体型 96/120，SIM.enemyWidth/Height 没被顺手改掉
  {
    const loop = new GameLoop();
    loadLevel(loop.state, bossLevelIndex);
    const boss = findBoss(loop);
    check(
      'Boss 体型 96/120 且 SIM 不变',
      boss !== undefined &&
        boss.width === 96 &&
        boss.height === 120 &&
        SIM.enemyWidth === 40 &&
        SIM.enemyHeight === 72,
      boss
        ? `w=${boss.width} h=${boss.height} SIM=${SIM.enemyWidth}/${SIM.enemyHeight}`
        : '找不到 Boss',
    );
  }

  // 2. heapShot 每 150 帧触发一次
  {
    const loop = new GameLoop();
    loadLevel(loop.state, bossLevelIndex);
    loop.state.player.invulnFrames = 999999;
    loop.state.player.position.x = 300;
    const idBefore = loop.state.nextProjectileId;
    stepFrames(loop, 300);
    const shots = loop.state.nextProjectileId - idBefore;
    check('heapShot 每 150 帧一次', shots === 2, `shots=${shots} 期望=2`);
  }

  // 3. 3 块碎片时墙速约 6 px/s；0 块时退回
  {
    const loop = new GameLoop();
    loadLevel(loop.state, bossLevelIndex);
    const boss = findBoss(loop)!;
    loop.state.player.invulnFrames = 999999;
    loop.state.player.position.x = 1000;
    boss.heapShotFramesLeft = 99999; // 压住 heapShot，避免碎片数量被干扰
    stepOnce(loop); // 让墙生成
    const left = () => loop.state.walls.find((w) => w.side === 'left')!;
    spawnHeapFragment(loop.state, 900, 440);
    spawnHeapFragment(loop.state, 950, 440);
    spawnHeapFragment(loop.state, 1050, 440);
    const x0 = left().edgeX;
    stepFrames(loop, 60);
    const pushed = left().edgeX - x0;
    check(
      '3 块碎片墙速约 6px/s',
      Math.abs(pushed - 6) < 1.5,
      `60 帧推进 ${pushed.toFixed(2)}px 期望≈6`,
    );
    loop.state.fragments = [];
    const x1 = left().edgeX;
    stepFrames(loop, 60);
    check(
      '0 块碎片墙退回',
      left().edgeX < x1,
      `edgeX ${x1.toFixed(1)} → ${left().edgeX.toFixed(1)}`,
    );
  }

  // 4 + 5 + 6. 66% 触发一次 GC；期间不动不攻击；结束后清碎片、墙回初始、放横扫波
  {
    const loop = new GameLoop();
    loadLevel(loop.state, bossLevelIndex);
    const boss = findBoss(loop)!;
    loop.state.player.invulnFrames = 999999;
    loop.state.player.position.x = 300;
    boss.heapShotFramesLeft = 99999;
    stepOnce(loop); // 墙生成
    // 先造出「墙已推进、场上有碎片」的状态
    loop.state.walls.find((w) => w.side === 'left')!.edgeX = 400;
    loop.state.walls.find((w) => w.side === 'right')!.edgeX = 1600;
    spawnHeapFragment(loop.state, 900, 440);
    spawnHeapFragment(loop.state, 1000, 440);

    boss.health = Math.floor(boss.maxHealth * 0.66);
    stepOnce(loop);
    const triggered = boss.bossPhase === 2 && boss.gcFrames === 299;
    check(
      '66% 血触发 GC PAUSE',
      triggered,
      `phase=${boss.bossPhase} gcFrames=${boss.gcFrames}`,
    );

    const projId = loop.state.nextProjectileId;
    let vxZero = true;
    for (let i = 0; i < 60; i++) {
      stepOnce(loop);
      if (boss.velocity.x !== 0) vxZero = false;
    }
    check(
      'GC 期间 Boss 不动且不产生新弹丸',
      vxZero && loop.state.nextProjectileId === projId,
      `vxZero=${vxZero} 新弹丸=${loop.state.nextProjectileId - projId}`,
    );

    // 走完剩余 GC（已走 61 帧，再补 239 帧到 gcFrames=0）
    stepFrames(loop, 239);
    check(
      'GC 只触发一次且结束后清碎片放横扫波',
      boss.bossPhase === 2 &&
        boss.gcFrames === 0 &&
        loop.state.fragments.length === 0 &&
        loop.state.hazards.length === 2,
      `phase=${boss.bossPhase} gc=${boss.gcFrames} 碎片=${loop.state.fragments.length} 波=${loop.state.hazards.length}`,
    );

    // 墙在 60 帧内回到初始位置
    stepFrames(loop, 61);
    const left = loop.state.walls.find((w) => w.side === 'left')!;
    const right = loop.state.walls.find((w) => w.side === 'right')!;
    check(
      'GC 后墙回到初始 edgeX',
      Math.abs(left.edgeX - 200) < 1 && Math.abs(right.edgeX - 1800) < 1,
      `left=${left.edgeX.toFixed(2)} right=${right.edgeX.toFixed(2)}`,
    );
  }

  // 7. knockbackResist 0.12：命中 Boss 后水平速度约 280 × 0.12
  {
    const loop = new GameLoop();
    loadLevel(loop.state, bossLevelIndex);
    const boss = findBoss(loop)!;
    stepOnce(loop);
    const proj: ProjectileState = {
      id: 9401,
      ownerId: 'player',
      gravity: 0,
      spawnFragmentOnLand: false,
      x: boss.position.x,
      y: boss.position.y - 60,
      vx: 100,
      vy: 0,
      radius: SIM.projectileRadius,
      damage: 30,
      lifetimeFrames: 30,
      originX: boss.position.x,
      originY: boss.position.y - 60,
      travelDistance: 0,
      maxDistance: SIM.projectileMaxDistance,
      alive: true,
    };
    loop.state.projectiles.push(proj);
    resolveProjectileHits(loop.state);
    const expected = SIM.knockbackX * 0.12;
    check(
      'Boss 击退抗性 0.12 生效',
      Math.abs(Math.abs(boss.velocity.x) - expected) < 0.01,
      `vx=${boss.velocity.x.toFixed(2)} 期望=${expected}`,
    );
  }

  if (failures.length > 0) {
    process.exitCode = 1;
    throw new Error(`模拟验证失败：${failures.join('、')}`);
  }

  console.log('S8 Boss P1 + P2 验证通过。');
}

runS8BossChecks();

/** S9：Boss P3（FATAL）+ 召唤 + 出口条件 */
function runS9FatalChecks(): void {
  const bossLevelIndex = LEVELS.length - 1;
  const findBoss = (loop: GameLoop) =>
    loop.state.enemies.find((e) => e.enemyKind === 'outOfMemoryError')!;
  const aliveSummons = (loop: GameLoop) =>
    loop.state.enemies.filter(
      (e) =>
        e.enemyKind === 'runtimeGlitch' &&
        e.id.startsWith('summon-') &&
        e.health > 0 &&
        e.behavior !== 'dead',
    ).length;
  const shootBoss = (loop: GameLoop, damage: number): void => {
    const boss = findBoss(loop);
    const proj: ProjectileState = {
      id: 9500 + loop.state.nextProjectileId,
      ownerId: 'player',
      gravity: 0,
      spawnFragmentOnLand: false,
      x: boss.position.x,
      y: boss.position.y - 60,
      vx: 100,
      vy: 0,
      radius: SIM.projectileRadius,
      damage,
      lifetimeFrames: 30,
      originX: boss.position.x,
      originY: boss.position.y - 60,
      travelDistance: 0,
      maxDistance: SIM.projectileMaxDistance,
      alive: true,
    };
    loop.state.projectiles.push(proj);
    resolveProjectileHits(loop.state);
  };

  // 0. 回归：每一关的玩家出生点都必须站在平台上（第三关出生点曾在悬崖上）
  {
    const bad: string[] = [];
    for (const level of LEVELS) {
      try {
        platformUnder(level, level.playerSpawnX, level.playerSpawnY);
      } catch {
        bad.push(level.id);
      }
    }
    check(
      '每关出生点都站在平台上',
      bad.length === 0,
      bad.length === 0 ? `levels=${LEVELS.length}` : `悬空：${bad.join(',')}`,
    );
  }

  // 1. spawnEnemy：id 唯一、countsTowardExit 默认 false、support 与出生平台一致
  {
    const loop = new GameLoop();
    loadLevel(loop.state, bossLevelIndex);
    const a = spawnEnemy(loop.state, 'runtimeGlitch', 800, 440);
    const b = spawnEnemy(loop.state, 'runtimeGlitch', 900, 440);
    const support = platformUnder(LEVELS[bossLevelIndex]!, 800, 440);
    check(
      'spawnEnemy id 唯一且默认不计出口',
      a.id !== b.id && a.countsTowardExit === false && b.countsTowardExit === false,
      `ids=${a.id},${b.id} counts=${a.countsTowardExit},${b.countsTowardExit}`,
    );
    check(
      'spawnEnemy support 与出生平台一致',
      a.support.id === support.id,
      `${a.support.id} vs ${support.id}`,
    );
  }

  // 2. 只打死 Boss、召唤物还活着时 exitUnlocked === true（防死锁）
  {
    const loop = new GameLoop();
    loadLevel(loop.state, bossLevelIndex);
    loop.state.player.invulnFrames = 999999;
    spawnEnemy(loop.state, 'runtimeGlitch', 800, 440);
    spawnEnemy(loop.state, 'runtimeGlitch', 900, 440);
    const boss = findBoss(loop);
    boss.health = 1;
    boss.invulnFrames = 0;
    shootBoss(loop, 30);
    // 命中带 4 帧 hit-stop，多推几帧让 updateLevel 跑到
    stepFrames(loop, 6);
    check(
      '只打死 Boss 出口就解锁（召唤物不挡）',
      boss.behavior === 'dead' && loop.state.level.exitUnlocked === true,
      `boss=${boss.behavior} exit=${loop.state.level.exitUnlocked} 召唤=${aliveSummons(loop)}`,
    );
  }

  // 3 + 4. 33% 只触发一次 P3；蓄力 40 帧不动，冲撞速度约 600
  // 5. 撞墙后 vulnerableFrames === 120，弹丸伤害 ×1.8
  // 6. 连续冲撞 3 次后存活召唤物不超过 4
  {
    const loop = new GameLoop();
    loadLevel(loop.state, bossLevelIndex);
    const boss = findBoss(loop);
    loop.state.player.invulnFrames = 999999;
    loop.state.player.position.x = 1000;
    boss.heapShotFramesLeft = 99999;
    boss.bossPhase = 2;
    boss.health = Math.floor(boss.maxHealth * 0.33);
    stepOnce(loop);
    check(
      '33% 血触发 FATAL',
      boss.bossPhase === 3 && boss.fatalFrames === 89,
      `phase=${boss.bossPhase} fatal=${boss.fatalFrames}`,
    );

    // 转场 90 帧：不动；结束后进蓄力
    let frozenDuringFatal = true;
    for (let i = 0; i < 89; i++) {
      stepOnce(loop);
      if (boss.velocity.x !== 0) frozenDuringFatal = false;
    }
    check(
      'FATAL 转场期间 Boss 不动且只触发一次',
      frozenDuringFatal && boss.fatalFrames === 0 && boss.bossPhase === 3,
      `frozen=${frozenDuringFatal} fatal=${boss.fatalFrames} phase=${boss.bossPhase}`,
    );

    // 蓄力 40 帧不动
    let windupStill = boss.chargePhase === 'windup';
    for (let i = 0; i < 40; i++) {
      stepOnce(loop);
      if (boss.chargePhase === 'windup' && boss.velocity.x !== 0) windupStill = false;
    }
    check(
      'P3 蓄力 40 帧不动',
      windupStill && boss.chargePhase === 'charge',
      `still=${windupStill} phase=${boss.chargePhase}`,
    );

    // 冲撞速度约 600
    stepOnce(loop);
    check(
      'P3 冲撞速度约 600',
      Math.abs(Math.abs(boss.velocity.x) - 600) < 0.01,
      `vx=${boss.velocity.x.toFixed(1)}`,
    );

    // 三次冲撞循环
    let stuns = 0;
    let vulnerableSeen = 0;
    let damageOk = false;
    let guard = 0;
    while (stuns < 3 && guard < 1500) {
      guard += 1;
      stepOnce(loop);
      if (boss.chargePhase === 'stun' && boss.vulnerableFrames > vulnerableSeen) {
        vulnerableSeen = boss.vulnerableFrames;
        if (stuns === 0 && boss.invulnFrames === 0 && boss.fatalFrames === 0) {
          // 第一次硬直：验证 ×1.8 受伤
          const hpBefore = boss.health;
          shootBoss(loop, 30);
          damageOk = hpBefore - boss.health === 54;
        }
      }
      // 硬直结束（回到 windup）记一次完整冲撞
      if (boss.chargePhase === 'windup' && vulnerableSeen > 0 && boss.vulnerableFrames === 0) {
        stuns += 1;
        vulnerableSeen = 1; // 等下一次 stun 覆盖
      }
    }
    check(
      '撞墙硬直 vulnerableFrames=120 且受伤 ×1.8',
      damageOk,
      `damageOk=${damageOk} vulnerableSeen=${vulnerableSeen}`,
    );
    check(
      '连续冲撞 3 次后存活召唤物不超过 4',
      stuns >= 3 && aliveSummons(loop) <= 4,
      `stuns=${stuns} 召唤=${aliveSummons(loop)} guard=${guard}`,
    );
  }

  // 7. 最后一关 Boss 死后：SUCCEEDED 停留，随后转场回第一关（主人要求循环）
  {
    const loop = new GameLoop();
    loadLevel(loop.state, bossLevelIndex);
    loop.state.player.invulnFrames = 999999;
    const boss = findBoss(loop);
    boss.health = 1;
    boss.invulnFrames = 0;
    shootBoss(loop, 30);
    // 命中带 4 帧 hit-stop，多推几帧让 updateLevel 跑到
    stepFrames(loop, 6);
    // 把玩家送到出口
    loop.state.player.position.x = loop.state.exit.x + 4;
    loop.state.player.position.y = 440;
    stepFrames(loop, 3);
    const reached = loop.state.match === 'levelCleared';
    // 120 帧结算 + 60 帧转场后应回到第一关
    stepFrames(loop, 200);
    check(
      'Boss 死后转场回第一关',
      reached && loop.state.levelIndex === 0 && loop.state.match === 'playing',
      `reached=${reached} levelIndex=${loop.state.levelIndex} match=${loop.state.match}`,
    );
  }

  if (failures.length > 0) {
    process.exitCode = 1;
    throw new Error(`模拟验证失败：${failures.join('、')}`);
  }

  console.log('S9 Boss P3 与召唤验证通过。');
}

runS9FatalChecks();

/** 新手教程配套：S 下蹲穿台 + 前两关结算 10 秒无操作自动进下一关 */
function runTutorialAndFlowChecks(): void {
  // 1. S 下蹲：站在薄平台（teach-low，h=16）上直接穿过，落回地面
  {
    const loop = new GameLoop();
    const player = loop.state.player;
    player.position.x = 240;
    player.position.y = 330;
    player.velocity.x = 0;
    player.velocity.y = 0;
    player.grounded = true;
    stepOnce(loop, { dropPressed: true });
    const droppedThrough = player.dropThroughFrames > 0 && !player.grounded;
    stepFrames(loop, 90);
    check(
      'S 下蹲从薄平台落下',
      droppedThrough && player.position.y === 440 && player.grounded,
      `dropping=${droppedThrough} y=${player.position.y.toFixed(1)} grounded=${player.grounded}`,
    );
  }

  // 2. S 在厚地面（h=80）上不生效
  {
    const loop = new GameLoop();
    stepOnce(loop, { dropPressed: true });
    stepFrames(loop, 10);
    check(
      'S 在厚地面不掉落',
      loop.state.player.position.y === 440 && loop.state.player.grounded,
      `y=${loop.state.player.position.y} grounded=${loop.state.player.grounded}`,
    );
  }

  // 3. 死亡后不自动进下一关：停留 ERROR，只能重新开始当前关
  {
    const loop = new GameLoop();
    // 把玩家放到第一个坑（400–450）上空
    loop.state.player.position.x = 420;
    loop.state.player.position.y = 440;
    loop.state.player.grounded = false;
    let guard = 0;
    while (loop.state.match === 'playing' && guard < 300) {
      stepOnce(loop);
      guard += 1;
    }
    const died = loop.state.match === 'defeat';
    stepFrames(loop, 700);
    check(
      '死亡后停在 ERROR 不自动进下一关',
      died && loop.state.levelIndex === 0 && loop.state.match === 'defeat',
      `died=${died} levelIndex=${loop.state.levelIndex} match=${loop.state.match}`,
    );
  }

  // 4. Boss 关（最后一关）死亡不自动进关
  {
    const loop = new GameLoop();
    loadLevel(loop.state, LEVELS.length - 1);
    loop.state.player.position.y = 600;
    stepOnce(loop);
    const died = loop.state.match === 'defeat';
    stepFrames(loop, 700);
    check(
      '最后一关死亡不自动进关',
      died && loop.state.levelIndex === LEVELS.length - 1 && loop.state.match === 'defeat',
      `died=${died} levelIndex=${loop.state.levelIndex} match=${loop.state.match}`,
    );
  }

  if (failures.length > 0) {
    process.exitCode = 1;
    throw new Error(`模拟验证失败：${failures.join('、')}`);
  }

  console.log('教程与结算流程验证通过。');
}

runTutorialAndFlowChecks();

/** 关卡几何回归：两级跳链、Boss 房出口与墙不重叠、Boss 跳台 */
function runGeometryAndBossJumpChecks(): void {
  // 1. 抬高的平台都必须二级跳：地面直上超过跳跃上限（约 123px），但有中间台接力
  {
    const raised: { level: number; high: string; mids: string[] }[] = [
      { level: 0, high: 'fight1-cover-high', mids: ['fight1-cover'] },
      { level: 0, high: 'upper-route-two', mids: ['upper-route-one'] },
      { level: 1, high: 'l2-high-1', mids: ['l2-mid-2'] },
      { level: 1, high: 'l2-high-2', mids: ['l2-mid-3'] },
      { level: 1, high: 'l2-high-3', mids: ['l2-mid-4'] },
    ];
    const bad: string[] = [];
    for (const { level, high, mids } of raised) {
      const platforms = LEVELS[level]!.platforms;
      const hp = platforms.find((p) => p.id === high)!;
      // 地面（440）直上不行
      if (440 - hp.y <= 123) bad.push(`${high} 地面可直上`);
      // 至少一块中间台能接力（升高 ≤110、水平间隙 ≤100）
      const reachable = mids.some((midId) => {
        const mid = platforms.find((p) => p.id === midId)!;
        const rise = mid.y - hp.y;
        const gap = Math.max(0, Math.max(mid.x - (hp.x + hp.w), hp.x - (mid.x + mid.w)));
        return rise > 0 && rise <= 110 && gap <= 100;
      });
      if (!reachable) bad.push(`${high} 没有接力台`);
    }
    check('抬高平台都是两级跳链', bad.length === 0, bad.length === 0 ? '5 处高台全部需二级跳且可接力' : bad.join('；'));
  }

  // 2. Boss 房出口门不与右墙初始位置重叠（门曾被墙挤伤玩家）
  {
    const level3 = LEVELS[LEVELS.length - 1]!;
    check(
      '出口门在右墙初始位置之外',
      level3.exit.x >= WALL_INITIAL_RIGHT + WALL_WIDTH,
      `exit.x=${level3.exit.x} 墙右缘=${WALL_INITIAL_RIGHT + WALL_WIDTH}`,
    );
  }

  // 3. 第三关有中场浮台，且从地面一级跳可上（80 ≤ 123）
  {
    const level3 = LEVELS[LEVELS.length - 1]!;
    const midLeft = level3.platforms.find((p) => p.id === 'l3-mid-left');
    const midRight = level3.platforms.find((p) => p.id === 'l3-mid-right');
    check(
      '第三关有中场浮台且可跳上',
      midLeft !== undefined &&
        midRight !== undefined &&
        440 - midLeft.y <= 110 &&
        440 - midRight.y <= 110,
      `left=${midLeft?.y} right=${midRight?.y}`,
    );
  }

  // 4. 玩家站上高台时 Boss 起跳追上去
  {
    const loop = new GameLoop();
    loadLevel(loop.state, LEVELS.length - 1);
    const boss = loop.state.enemies.find((e) => e.enemyKind === 'outOfMemoryError')!;
    loop.state.player.invulnFrames = 999999;
    boss.heapShotFramesLeft = 99999;
    // 玩家站上左侧高台（y=330），Boss 在 600（水平距离 380 ≤ 400）
    loop.state.player.position.x = 220;
    loop.state.player.position.y = 330;
    loop.state.player.grounded = true;
    boss.position.x = 600;
    stepOnce(loop);
    check(
      '玩家上高台时 Boss 起跳',
      boss.velocity.y < 0 && !boss.grounded,
      `vy=${boss.velocity.y.toFixed(1)} grounded=${boss.grounded}`,
    );
    // 跳完冷却内不再起跳
    let jumpedAgain = false;
    for (let i = 0; i < 60; i++) {
      stepOnce(loop);
      if (boss.grounded && boss.velocity.y < 0) jumpedAgain = true;
    }
    check(
      'Boss 跳台有冷却',
      !jumpedAgain && boss.bossJumpCooldownFrames >= 0,
      `cooldown=${boss.bossJumpCooldownFrames}`,
    );
  }

  if (failures.length > 0) {
    process.exitCode = 1;
    throw new Error(`模拟验证失败：${failures.join('、')}`);
  }

  console.log('关卡几何与 Boss 跳台验证通过。');
}

runGeometryAndBossJumpChecks();
