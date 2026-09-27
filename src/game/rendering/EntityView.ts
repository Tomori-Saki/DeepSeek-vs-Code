import Phaser from 'phaser';
import { ENEMY_KIND_SPRITES } from '../assets/manifest';
import type { PlayerState } from '../simulation/PlayerState';
import type { EnemyState } from '../simulation/EnemyState';
import {
  ENEMY_VISUAL,
  enemyAttackSquash,
  enemyBob,
  enemyPhase,
  enemyStackPips,
  enemyStackScale,
  type EnemyVisualSpec,
  type Squash,
} from './EnemyVisualParams';

/**
 * 把模拟实体同步到 Phaser sprite。
 * 显示用等比像素缩放（脚对齐 position）；碰撞尺寸仍只来自模拟。
 * 玩家 attack 播 player-attack（手枪四帧），不画近战挥刀。
 * 敌人 sprite 缩放只在 applyEnemyTransform / setDeathTransform 各写一次。
 * stackOverflowError 的头顶层数方块是离散状态标记，随 setShown / destroy 一起收掉。
 */
export class EntityView {
  private readonly kind: 'player' | 'enemy';
  private readonly sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Ellipse | null = null;
  /** 头顶层数方块池。只给 stackOverflowError 建，其余 kind 保持空。 */
  private readonly stackPips: Phaser.GameObjects.Rectangle[] = [];
  /** 活着的 stackOverflowError 才为 true；死亡或空布局时关掉，避免 setShown(true) 把方块露出来。 */
  private stackPipsWanted = false;
  private currentAnimKey: string | null = null;

  /** 目标显示高度（像素）；64 或整数倍，保持贴图等比 */
  private static readonly DISPLAY_H = 64;
  /** 与 enemyStackPips 的 6×6 一致；纯函数只返回偏移，尺寸在这里落地 */
  private static readonly STACK_PIP_COUNT = 4;
  private static readonly STACK_PIP_SIZE = 6;
  private static readonly STACK_PIP_DEPTH = 21;
  private static readonly STACK_PIP_FILLED = 0xd6b3ff;
  private static readonly STACK_PIP_EMPTY_FILL = 0x2a1e3a;
  private static readonly STACK_PIP_EMPTY_STROKE = 0x6b4f96;

  /** 贴图等比系数，syncPixelScale 只写这个，不再直接 setScale */
  private baseScale = 1;
  /** 出生缩入系数，由 EnemyView 在 sync 之前写入 */
  private spawnScale = 1;
  private spawnAlpha = 1;

  constructor(scene: Phaser.Scene, kind: 'player' | 'enemy', initialKey?: string) {
    this.kind = kind;

    // 玩家固定 idle；敌人用调用方传入的 kind 贴图，避免先挂错图再换
    const fallbackKey = kind === 'player' ? 'player-idle' : initialKey!;
    this.sprite = scene.add.sprite(0, 0, fallbackKey);
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setDepth(20);
    this.applyNearest();
  }

  sync(entity: PlayerState | EnemyState, frame = 0): void {
    // 占位图默认朝右；facing<0 水平翻转
    this.sprite.setFlipX(entity.facing < 0);

    if (this.kind === 'player') {
      const animKey = `player-${(entity as PlayerState).locomotion}`;
      if (animKey !== this.currentAnimKey) {
        if (this.sprite.scene.anims.exists(animKey)) {
          this.sprite.play(animKey, true);
          this.currentAnimKey = animKey;
        } else if (this.sprite.scene.textures.exists(animKey)) {
          this.sprite.setTexture(animKey);
          this.currentAnimKey = animKey;
        }
        this.applyNearest();
      }
    } else {
      const enemy = entity as EnemyState;
      const kindSpec = ENEMY_KIND_SPRITES[enemy.enemyKind];
      // Boss 进 P3 后换成内核贴图（缺图走 PreloadScene 占位兜底）
      const textureKey =
        enemy.enemyKind === 'outOfMemoryError' && enemy.bossPhase === 3 && kindSpec.coreKey
          ? kindSpec.coreKey
          : kindSpec.key;
      if (textureKey !== this.currentAnimKey) {
        this.sprite.setTexture(textureKey);
        this.currentAnimKey = textureKey;
        this.applyNearest();
      }
    }

    // 玩家固定显示 64px 高；敌人用各自 kind 的 displayHeight（Boss 128）
    this.syncPixelScale(
      this.kind === 'player'
        ? EntityView.DISPLAY_H
        : ENEMY_VISUAL[(entity as EnemyState).enemyKind].displayHeight,
    );

    if (this.kind === 'player') {
      this.sprite.setPosition(entity.position.x, entity.position.y);
      this.sprite.setScale(this.baseScale);
      if (entity.flashFrames > 0) {
        this.sprite.setTintFill(0xffffff);
      } else if ((entity as PlayerState).slowFrames > 0) {
        // 故障场减速：紫青染色提示
        this.sprite.setTint(0xb08cff);
      } else {
        this.sprite.clearTint();
      }
      return;
    }

    const enemy = entity as EnemyState;
    const spec = ENEMY_VISUAL[enemy.enemyKind];
    const phase = enemyPhase(enemy.id, spec.bobPeriod);
    const bob = enemyBob(frame, phase, spec);
    const squash =
      enemy.behavior === 'attack'
        ? enemyAttackSquash(
            enemy.attackPhase,
            enemy.attackFramesLeft,
            enemy.attackRecoveryFrames,
            enemy.facing,
          )
        : { offsetX: 0, scaleX: 1, scaleY: 1 };
    const offsetX = squash.offsetX + (enemy.hurtFrames > 0 ? -2 * enemy.facing : 0);
    const offsetY = spec.hoverY + bob;
    this.applyEnemyTransform(enemy, squash, offsetX, offsetY);
    this.applyEnemyTint(enemy);
  }

  /** 只写出生系数，不碰 sprite；随后的 sync 才是唯一写入点。 */
  setSpawnTransform(alpha: number, scale: number): void {
    this.spawnAlpha = alpha;
    this.spawnScale = scale;
  }

  /**
   * 死亡专用变换。用 baseScale 组合，不再走 sync，避免和出生/攻击缩放互相覆盖。
   */
  setDeathTransform(
    enemy: EnemyState,
    t: {
      tintFillWhite: boolean;
      visible: boolean;
      alpha: number;
      scaleX: number;
      scaleY: number;
      liftY: number;
    },
  ): void {
    this.syncPixelScale(ENEMY_VISUAL[enemy.enemyKind].displayHeight);
    this.sprite.setVisible(t.visible);
    this.sprite.setAlpha(t.alpha);
    this.sprite.setScale(this.baseScale * t.scaleX, this.baseScale * t.scaleY);
    this.sprite.setPosition(enemy.position.x, enemy.position.y + t.liftY);
    if (t.tintFillWhite) {
      this.sprite.setTintFill(0xffffff);
    } else {
      this.sprite.clearTint();
    }
    // 死亡不画层数方块，只隐藏，避免和消散缩放抢位置
    this.stackPipsWanted = false;
    this.hideStackPips();
  }

  /** 阴影留在脚底，不跟呼吸和悬停。 */
  setShadow(enemy: EnemyState, spec: EnemyVisualSpec): void {
    const shadow = this.ensureShadow(spec);
    shadow.setPosition(enemy.position.x, enemy.position.y + 2);
    shadow.setSize(spec.shadowWidth, 6);
    shadow.setFillStyle(0x05070f, spec.shadowAlpha);
  }

  setShadowVisible(shown: boolean): void {
    this.shadow?.setVisible(shown);
  }

  setShown(shown: boolean): void {
    this.sprite.setVisible(shown);
    this.shadow?.setVisible(shown);
    if (!shown || !this.stackPipsWanted) {
      this.hideStackPips();
      return;
    }
    for (const pip of this.stackPips) {
      pip.setVisible(true);
    }
  }

  destroy(): void {
    this.shadow?.destroy();
    this.shadow = null;
    for (const pip of this.stackPips) {
      pip.destroy();
    }
    this.stackPips.length = 0;
    this.stackPipsWanted = false;
    this.sprite.destroy();
  }

  /** 敌人 sprite 唯一的位置/缩放写入点。offset 用整像素。层数方块不走 setScale。 */
  private applyEnemyTransform(
    entity: EnemyState,
    squash: Squash,
    offsetX: number,
    offsetY: number,
  ): void {
    const s =
      this.baseScale *
      this.spawnScale *
      enemyStackScale(entity.enemyKind, entity.stackDepth);
    this.sprite.setScale(s * squash.scaleX, s * squash.scaleY);
    this.sprite.setPosition(
      entity.position.x + Math.round(offsetX),
      entity.position.y + Math.round(offsetY),
    );
    this.sprite.setAlpha(this.spawnAlpha);
    this.layoutStackPips(entity);
  }

  /** 按 enemyStackPips 摆 4 个方块。空数组（非 stackOverflowError）全部隐藏。 */
  private layoutStackPips(enemy: EnemyState): void {
    const pips = enemyStackPips(
      enemy.enemyKind,
      enemy.stackDepth,
      ENEMY_VISUAL[enemy.enemyKind],
    );
    if (pips.length === 0) {
      this.stackPipsWanted = false;
      this.hideStackPips();
      return;
    }
    this.stackPipsWanted = true;
    const rects = this.ensureStackPips();
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i]!;
      const pip = pips[i];
      if (!pip) {
        rect.setVisible(false);
        continue;
      }
      rect.setVisible(true);
      rect.setPosition(
        Math.round(enemy.position.x + pip.dx),
        Math.round(enemy.position.y + pip.dy),
      );
      if (pip.filled) {
        rect.setFillStyle(EntityView.STACK_PIP_FILLED, 1);
        rect.setStrokeStyle(0, EntityView.STACK_PIP_EMPTY_STROKE, 1);
      } else {
        rect.setFillStyle(EntityView.STACK_PIP_EMPTY_FILL, 0.5);
        rect.setStrokeStyle(1, EntityView.STACK_PIP_EMPTY_STROKE, 1);
      }
    }
  }

  private hideStackPips(): void {
    for (const pip of this.stackPips) {
      pip.setVisible(false);
    }
  }

  private ensureStackPips(): Phaser.GameObjects.Rectangle[] {
    while (this.stackPips.length < EntityView.STACK_PIP_COUNT) {
      const rect = this.sprite.scene.add
        .rectangle(
          0,
          0,
          EntityView.STACK_PIP_SIZE,
          EntityView.STACK_PIP_SIZE,
          EntityView.STACK_PIP_EMPTY_FILL,
          0.5,
        )
        .setOrigin(0.5, 0.5)
        .setStrokeStyle(1, EntityView.STACK_PIP_EMPTY_STROKE, 1)
        .setDepth(EntityView.STACK_PIP_DEPTH)
        .setVisible(false);
      this.stackPips.push(rect);
    }
    return this.stackPips;
  }

  /** 白闪 > 攻击蓄力暖白 > 硬直淡红 > 清染色。命中即停，不叠加。 */
  private applyEnemyTint(enemy: EnemyState): void {
    if (enemy.flashFrames > 0) {
      this.sprite.setTintFill(0xffffff);
      return;
    }
    if (
      enemy.behavior === 'attack' &&
      (enemy.attackPhase === 'startup' || enemy.attackPhase === 'active')
    ) {
      this.sprite.setTint(0xffe9c9);
      return;
    }
    if (enemy.hurtFrames > 0) {
      this.sprite.setTint(0xff9a9a);
      return;
    }
    this.sprite.clearTint();
  }

  private ensureShadow(spec: EnemyVisualSpec): Phaser.GameObjects.Ellipse {
    if (!this.shadow) {
      this.shadow = this.sprite.scene.add.ellipse(
        0,
        0,
        spec.shadowWidth,
        6,
        0x05070f,
        spec.shadowAlpha,
      );
      this.shadow.setDepth(19);
    }
    return this.shadow;
  }

  /** 按帧高与目标显示高度算 baseScale，不用非等比 setDisplaySize 拉伸 */
  private syncPixelScale(targetHeight: number): void {
    const srcH = this.sprite.frame.height;
    if (srcH <= 0) {
      return;
    }
    this.baseScale = targetHeight / srcH;
  }

  private applyNearest(): void {
    const key = this.sprite.texture?.key;
    if (key && this.sprite.scene.textures.exists(key)) {
      this.sprite.scene.textures
        .get(key)
        .setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }
}
