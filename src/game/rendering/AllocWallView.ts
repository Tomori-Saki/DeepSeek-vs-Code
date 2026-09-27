import Phaser from 'phaser';
import type { AllocWall } from '../simulation/AllocWall';
import type { SweepWave } from '../simulation/SweepWave';

/**
 * 内存墙与横扫波视图：纯渲染，只读模拟状态。
 * 墙是深底绿边的竖块；横扫波是红色竖条。
 */
export class AllocWallView {
  private readonly scene: Phaser.Scene;
  private readonly walls: Phaser.GameObjects.Rectangle[] = [];
  private readonly waves: Phaser.GameObjects.Rectangle[] = [];

  private static readonly WALL_DEPTH = 18;
  private static readonly WALL_FILL = 0x10240f;
  private static readonly WALL_STROKE = 0x39f08a;
  private static readonly WAVE_DEPTH = 19;
  private static readonly WAVE_FILL = 0xff3b3b;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** groundTop 用 Boss 脚底 y（440），墙从地面向上长 */
  sync(walls: readonly AllocWall[], hazards: readonly SweepWave[], groundTop: number): void {
    let wallUsed = 0;
    for (const wall of walls) {
      const rect = this.acquireWall(wallUsed);
      wallUsed += 1;
      const centerX = wall.side === 'left' ? wall.edgeX - wall.width / 2 : wall.edgeX + wall.width / 2;
      rect.setPosition(Math.round(centerX), Math.round(groundTop - wall.height / 2));
      rect.setSize(wall.width, wall.height);
      rect.setVisible(true);
    }
    for (let i = wallUsed; i < this.walls.length; i++) {
      this.walls[i]!.setVisible(false);
    }

    let waveUsed = 0;
    for (const wave of hazards) {
      if (!wave.alive) continue;
      const rect = this.acquireWave(waveUsed);
      waveUsed += 1;
      rect.setPosition(Math.round(wave.x), Math.round(wave.y - wave.height / 2));
      rect.setSize(20, wave.height);
      rect.setVisible(true);
    }
    for (let i = waveUsed; i < this.waves.length; i++) {
      this.waves[i]!.setVisible(false);
    }
  }

  destroy(): void {
    for (const rect of this.walls) rect.destroy();
    for (const rect of this.waves) rect.destroy();
    this.walls.length = 0;
    this.waves.length = 0;
  }

  private acquireWall(index: number): Phaser.GameObjects.Rectangle {
    if (index < this.walls.length) {
      return this.walls[index]!;
    }
    const rect = this.scene.add
      .rectangle(0, 0, 48, 240, AllocWallView.WALL_FILL, 0.85)
      .setStrokeStyle(2, AllocWallView.WALL_STROKE, 1)
      .setDepth(AllocWallView.WALL_DEPTH)
      .setVisible(false);
    this.walls.push(rect);
    return rect;
  }

  private acquireWave(index: number): Phaser.GameObjects.Rectangle {
    if (index < this.waves.length) {
      return this.waves[index]!;
    }
    const rect = this.scene.add
      .rectangle(0, 0, 20, 60, AllocWallView.WAVE_FILL, 0.9)
      .setDepth(AllocWallView.WAVE_DEPTH)
      .setVisible(false);
    this.waves.push(rect);
    return rect;
  }
}
