import Phaser from 'phaser';
import { PROJECTILE_KEY } from '../assets/manifest';
import type { ProjectileState } from '../simulation/ProjectileState';
import type { PlayerState } from '../simulation/PlayerState';

/**
 * 弹丸精灵池：只画 alive 的弹丸，不改模拟。
 * 可选枪口火光纯属视图层。
 * heap 方块用独立 Graphics 池；null 文字弹丸逻辑保持原样。
 */
export class ProjectileView {
  private readonly scene: Phaser.Scene;
  private readonly pool: Phaser.GameObjects.Sprite[] = [];
  private readonly nullPool: Phaser.GameObjects.Text[] = [];
  private readonly heapPool: Phaser.GameObjects.Graphics[] = [];
  private readonly muzzle: Phaser.GameObjects.Rectangle;
  /** 调用方没传 frame 时，用 sync 次数当地帧（GameScene 目前只传弹丸数组） */
  private heapBlinkFrame = 0;
  private static readonly DEPTH = 30;
  private static readonly HEAP_FILL = 0x39f08a;
  private static readonly HEAP_STROKE = 0x0a2e1c;
  private static readonly HEAP_HI = 0xf4fff8;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    // 小方块当枪口火光，仅视图，不进模拟
    this.muzzle = scene.add
      .rectangle(0, 0, 10, 6, 0xfff4c0, 1)
      .setOrigin(0.5, 0.5)
      .setDepth(ProjectileView.DEPTH + 1)
      .setVisible(false);
  }

  sync(projectiles: readonly ProjectileState[], frame?: number): void {
    let spriteIndex = 0;
    let nullIndex = 0;
    let heapIndex = 0;
    // 传入 frame 时跟模拟帧；省略时每调用一次算一帧，这样不改 GameScene 也会闪
    const blinkFrame = frame ?? this.heapBlinkFrame;
    if (frame === undefined) {
      this.heapBlinkFrame += 1;
    }
    const highlight = Math.floor(blinkFrame / 2) % 2 === 1;

    for (const p of projectiles) {
      if (!p.alive) {
        continue;
      }

      if (p.kind === 'null') {
        const label = this.acquireNull(nullIndex);
        nullIndex += 1;
        label.setText('NULL');
        label.setVisible(true);
        label.setPosition(p.x, p.y);
        continue;
      }

      // 模拟层尚未声明 'heap' 时用收窄判断，等 kind 扩展后仍能画
      if ((p as { kind?: string }).kind === 'heap') {
        const block = this.acquireHeap(heapIndex);
        heapIndex += 1;
        this.paintHeap(block, p.x, p.y, highlight);
        continue;
      }

      const sprite = this.acquire(spriteIndex);
      spriteIndex += 1;

      sprite.setVisible(true);
      sprite.setPosition(p.x, p.y);
      const size = Math.max(2, p.radius * 2);
      sprite.setDisplaySize(size, size);
    }

    // 隐藏池里多余精灵
    for (let i = spriteIndex; i < this.pool.length; i++) {
      this.pool[i].setVisible(false);
    }
    for (let i = nullIndex; i < this.nullPool.length; i++) {
      this.nullPool[i].setVisible(false);
    }
    for (let i = heapIndex; i < this.heapPool.length; i++) {
      this.heapPool[i].clear();
      this.heapPool[i].setVisible(false);
    }
  }

  /** 玩家 fire 阶段时在枪口附近闪一下；其余阶段关掉 */
  syncMuzzleFlash(player: PlayerState): void {
    if (player.attackPhase !== 'fire') {
      this.muzzle.setVisible(false);
      return;
    }

    const tipX = player.position.x + player.facing * (player.width * 0.55);
    const tipY = player.position.y - player.height * 0.55;
    this.muzzle.setPosition(tipX, tipY);
    this.muzzle.setVisible(true);
  }

  destroy(): void {
    for (const s of this.pool) {
      s.destroy();
    }
    this.pool.length = 0;
    for (const label of this.nullPool) {
      label.destroy();
    }
    this.nullPool.length = 0;
    for (const block of this.heapPool) {
      block.destroy();
    }
    this.heapPool.length = 0;
    this.muzzle.destroy();
  }

  private acquire(index: number): Phaser.GameObjects.Sprite {
    if (index < this.pool.length) {
      return this.pool[index];
    }

    const sprite = this.scene.add.sprite(0, 0, PROJECTILE_KEY);
    sprite.setOrigin(0.5, 0.5);
    sprite.setDepth(ProjectileView.DEPTH);
    if (this.scene.textures.exists(PROJECTILE_KEY)) {
      this.scene.textures
        .get(PROJECTILE_KEY)
        .setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    sprite.setVisible(false);
    this.pool.push(sprite);
    return sprite;
  }

  private acquireNull(index: number): Phaser.GameObjects.Text {
    if (index < this.nullPool.length) {
      return this.nullPool[index];
    }

    const label = this.scene.add
      .text(0, 0, 'NULL', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '8px',
        color: '#70f7ff',
        stroke: '#092f42',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(ProjectileView.DEPTH)
      .setVisible(false);
    this.nullPool.push(label);
    return label;
  }

  /**
   * 14×14：外圈 1px 深色，内部始终 #39f08a。
   * 高光是左上 3×3，每 2 帧出现一次，不用 tween。
   */
  private paintHeap(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    highlight: boolean,
  ): void {
    g.clear();
    g.setPosition(Math.round(x) - 7, Math.round(y) - 7);
    g.fillStyle(ProjectileView.HEAP_STROKE, 1);
    g.fillRect(0, 0, 14, 14);
    g.fillStyle(ProjectileView.HEAP_FILL, 1);
    g.fillRect(1, 1, 12, 12);
    if (highlight) {
      g.fillStyle(ProjectileView.HEAP_HI, 1);
      g.fillRect(2, 2, 3, 3);
    }
    g.setVisible(true);
  }

  private acquireHeap(index: number): Phaser.GameObjects.Graphics {
    const existing = this.heapPool[index];
    if (existing) {
      return existing;
    }

    const block = this.scene.add.graphics();
    block.setDepth(ProjectileView.DEPTH);
    block.setVisible(false);
    this.heapPool.push(block);
    return block;
  }
}
