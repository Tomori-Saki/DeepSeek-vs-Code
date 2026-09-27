import Phaser from 'phaser';

/** 启动场景：立刻切到预加载。 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    this.scene.start('PreloadScene');
  }
}
