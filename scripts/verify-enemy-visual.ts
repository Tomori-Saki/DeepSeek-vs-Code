/**
 * 只测敌人表现层纯函数，不启动 Phaser。
 * 失败时设置 process.exitCode=1 并最终抛错。
 */
import type { EnemyKind } from '../src/game/levels/level1';
import {
  ENEMY_VISUAL,
  enemyAttackSquash,
  enemyBob,
  enemyDeathTransform,
  enemyPhase,
  enemySpawnTransform,
} from '../src/game/rendering/EnemyVisualParams';
import {
  enemyStackPips,
  enemyStackScale,
} from '../src/game/rendering/EnemyVisualParams';

const failures: string[] = [];

function check(name: string, ok: boolean, detail: string): void {
  if (ok) {
    console.log(`通过：${name} — ${detail}`);
  } else {
    console.log(`失败：${name} — ${detail}`);
    failures.push(name);
    process.exitCode = 1;
  }
}

const KINDS: EnemyKind[] = [
  'syntaxError',
  'nullPointerException',
  'stackOverflowError',
  'runtimeGlitch',
];

function main(): void {
  for (const kind of KINDS) {
    const spec = ENEMY_VISUAL[kind];
    let sum = 0;
    let min = 0;
    let max = 0;
    let integer = true;
    let withinAmp = true;
    for (let frame = 0; frame < spec.bobPeriod; frame++) {
      const bob = enemyBob(frame, 0, spec);
      sum += bob;
      min = Math.min(min, bob);
      max = Math.max(max, bob);
      if (!Number.isInteger(bob)) integer = false;
      if (Math.abs(bob) > spec.bobAmplitude) withinAmp = false;
    }
    check(
      `${kind} 呼吸整数且不超振幅`,
      integer && withinAmp,
      `period=${spec.bobPeriod} amp=${spec.bobAmplitude}`,
    );
    // 取整会留下 ±1～2 像素的周期余量；单向漂移的和会接近 period * amplitude。
    check(
      `${kind} 呼吸一周期和接近 0`,
      min < 0 && max > 0 && Math.abs(sum) <= spec.bobAmplitude * 2,
      `sum=${sum} min=${min} max=${max}`,
    );
  }

  const phases = ['a', 'b', 'enemy-1', 'enemy-2', 'glitch'].map((id) =>
    enemyPhase(id, 48),
  );
  check(
    '不同 id 相位不全相同',
    new Set(phases).size >= 2,
    `phases=${phases.join(',')}`,
  );

  const spawn0 = enemySpawnTransform(0);
  check(
    '出生 0 帧',
    spawn0.alpha === 0 && spawn0.scale === 0.65,
    `alpha=${spawn0.alpha} scale=${spawn0.scale}`,
  );
  const spawn6 = enemySpawnTransform(6);
  check(
    '出生 6 帧在中间',
    spawn6.alpha === 0.5 && Math.abs(spawn6.scale - 0.825) < 1e-9,
    `alpha=${spawn6.alpha} scale=${spawn6.scale}`,
  );
  for (const elapsed of [12, 13, 48]) {
    const spawn = enemySpawnTransform(elapsed);
    check(
      `出生 ${elapsed} 帧收束`,
      spawn.alpha === 1 && Math.abs(spawn.scale - 1) < 1e-9,
      `alpha=${spawn.alpha} scale=${spawn.scale}`,
    );
  }

  const death0 = enemyDeathTransform(0);
  const death8 = enemyDeathTransform(8);
  const death9 = enemyDeathTransform(9);
  const death20 = enemyDeathTransform(20);
  const death21 = enemyDeathTransform(21);
  const death40 = enemyDeathTransform(40);
  check('死亡 0 帧白闪', death0.tintFillWhite === true, `tint=${death0.tintFillWhite}`);
  check('死亡 8 帧仍白闪', death8.tintFillWhite === true, `tint=${death8.tintFillWhite}`);
  check(
    '死亡 9 帧开始消散',
    death9.tintFillWhite === false && death9.visible === true,
    `tint=${death9.tintFillWhite} visible=${death9.visible}`,
  );
  check(
    '死亡 20 帧透明度接近 0',
    Math.abs(death20.alpha) < 1e-9 && death20.visible === true,
    `alpha=${death20.alpha} visible=${death20.visible}`,
  );
  check(
    '死亡 21 帧起不可见',
    death21.visible === false && death21.tintFillWhite === false,
    `visible=${death21.visible}`,
  );
  check(
    '死亡 40 帧仍不可见',
    death40.visible === false && death40.alpha === 0,
    `visible=${death40.visible} alpha=${death40.alpha}`,
  );

  for (const facing of [-1, 1] as const) {
    const startup = enemyAttackSquash('startup', 10, 24, facing);
    check(
      `攻击 startup facing=${facing}`,
      startup.scaleX === 0.92 &&
        startup.scaleY === 1.06 &&
        startup.offsetX === 3 * facing,
      `scale=${startup.scaleX}/${startup.scaleY} offsetX=${startup.offsetX}`,
    );
    const active = enemyAttackSquash('active', 2, 24, facing);
    check(
      `攻击 active facing=${facing}`,
      active.scaleX === 1.08 &&
        active.scaleY === 0.94 &&
        active.offsetX === 5 * facing,
      `scale=${active.scaleX}/${active.scaleY} offsetX=${active.offsetX}`,
    );
  }

  const recovered = enemyAttackSquash('recovery', 0, 24, 1);
  check(
    '攻击 recovery 收招回正',
    Math.abs(recovered.scaleX - 1) < 1e-9 &&
      Math.abs(recovered.scaleY - 1) < 1e-9 &&
      recovered.offsetX === 0,
    `scaleX=${recovered.scaleX} scaleY=${recovered.scaleY} offsetX=${recovered.offsetX}`,
  );

  let offsetsIntegral = true;
  const samples: string[] = [];
  for (const facing of [-1, 1] as const) {
    for (const phase of ['none', 'startup', 'active', 'recovery', 'other']) {
      for (const framesLeft of [0, 1, 7, 12, 24]) {
        const squash = enemyAttackSquash(phase, framesLeft, 24, facing);
        samples.push(String(squash.offsetX));
        if (!Number.isInteger(squash.offsetX)) offsetsIntegral = false;
      }
    }
  }
  check('攻击 offsetX 全是整数', offsetsIntegral, `sample=${samples.slice(0, 8).join(',')}`);

  // S4：stackOverflowError 叠层缩放。超过 4 层钳到满层，浮点用 1e-6。
  const stackScales = [1, 1.06, 1.12, 1.18, 1.24];
  for (let depth = 0; depth <= 4; depth++) {
    const scale = enemyStackScale('stackOverflowError', depth);
    check(
      `stackOverflowError 层数 ${depth} 缩放`,
      Math.abs(scale - stackScales[depth]) < 1e-6,
      `scale=${scale} 期望=${stackScales[depth]}`,
    );
  }
  for (const depth of [5, 8]) {
    const scale = enemyStackScale('stackOverflowError', depth);
    check(
      `stackOverflowError 层数 ${depth} 钳到 1.24`,
      Math.abs(scale - 1.24) < 1e-6,
      `scale=${scale}`,
    );
  }

  const otherKinds: EnemyKind[] = [
    'syntaxError',
    'nullPointerException',
    'runtimeGlitch',
    'outOfMemoryError',
  ];
  for (const kind of otherKinds) {
    let allOne = true;
    const samples: string[] = [];
    for (const depth of [0, 1, 2, 3, 4, 6]) {
      const scale = enemyStackScale(kind, depth);
      samples.push(String(scale));
      if (Math.abs(scale - 1) >= 1e-6) allOne = false;
    }
    check(`${kind} 任意层数缩放为 1`, allOne, `scales=${samples.join(',')}`);
  }

  for (const kind of otherKinds) {
    const spec = ENEMY_VISUAL[kind];
    const lengths = [0, 2, 4].map((depth) => enemyStackPips(kind, depth, spec).length);
    check(
      `${kind} 层数方块为空`,
      lengths.every((n) => n === 0),
      `lengths=${lengths.join(',')}`,
    );
  }
  const stackPips = enemyStackPips('stackOverflowError', 2, ENEMY_VISUAL.stackOverflowError);
  const filled = stackPips.map((pip) => pip.filled);
  check(
    'stackOverflowError 两层点亮前两格',
    stackPips.length === 4 &&
      filled[0] === true &&
      filled[1] === true &&
      filled[2] === false &&
      filled[3] === false,
    `len=${stackPips.length} filled=${filled.join(',')}`,
  );

  if (failures.length > 0) {
    process.exitCode = 1;
    throw new Error(`敌人表现验证失败：${failures.join('、')}`);
  }
}

main();
