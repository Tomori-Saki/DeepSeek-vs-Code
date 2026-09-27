import Phaser from 'phaser';
import { SIM } from '../config';

/**
 * 只水平跟随玩家，垂直保持在关卡地面高度。靠近世界两端时夹紧。
 */
export class CameraController {
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private scrollX = 0;

  constructor(scene: Phaser.Scene, worldWidth: number, worldHeight: number) {
    this.camera = scene.cameras.main;
    this.camera.setBounds(0, 0, worldWidth, worldHeight);
    this.camera.setScroll(0, 0);
  }

  update(playerX: number, shakeFrames: number, frame: number, worldWidth: number): void {
    const viewW = this.camera.width;
    const maxScroll = Math.max(0, worldWidth - viewW);
    const target = Phaser.Math.Clamp(playerX - viewW / 2, 0, maxScroll);
    this.scrollX += (target - this.scrollX) * 0.18;

    let ox = 0;
    let oy = 0;
    if (shakeFrames > 0) {
      const t = shakeFrames / SIM.shakeFrames;
      const amp = 6 * t;
      ox = Math.sin(frame * 1.7) * amp;
      oy = Math.cos(frame * 2.3) * amp * 0.35;
    }
    this.camera.setScroll(Phaser.Math.Clamp(this.scrollX + ox, 0, maxScroll), oy);
  }
}
