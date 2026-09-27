import './styles/game.css';
import Phaser from 'phaser';
import { SIM, VIEW } from './game/config';
import BootScene from './game/scenes/BootScene';
import PreloadScene from './game/scenes/PreloadScene';
import GameScene from './game/scenes/GameScene';
import DebugScene from './game/scenes/DebugScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: VIEW.parentId,
  width: SIM.worldWidth,
  height: SIM.worldHeight,
  backgroundColor: VIEW.backgroundColor,
  pixelArt: true,
  antialias: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    pixelArt: true,
    antialias: false,
    roundPixels: true,
  },
  fps: {
    target: 60,
    forceSetTimeOut: true,
  },
  scene: [BootScene, PreloadScene, GameScene, DebugScene],
});

// 本地调试句柄：浏览器验收时读模拟状态用，不进 bundle 外的任何请求
(window as unknown as { __game: Phaser.Game }).__game = game;
