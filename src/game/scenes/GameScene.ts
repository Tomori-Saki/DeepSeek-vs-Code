import Phaser from 'phaser';
import { GameLoop, type InputFrame } from '../simulation/GameLoop';
import { InputMap } from '../input/InputMap';
import { BossBarView } from '../ui/BossBarView';
import { HudController } from '../ui/HudController';
import { OverlayController } from '../ui/OverlayController';
import { ArenaView } from '../rendering/ArenaView';
import { EntityView } from '../rendering/EntityView';
import { AfterimageView } from '../rendering/AfterimageView';
import { AllocWallView } from '../rendering/AllocWallView';
import { FatalCoreView } from '../rendering/FatalCoreView';
import { GlitchZoneView } from '../rendering/GlitchZoneView';
import { HeapFragmentView } from '../rendering/HeapFragmentView';
import { HeapWarningView } from '../rendering/HeapWarningView';
import { EnemyView } from '../rendering/EnemyView';
import { ExitView } from '../rendering/ExitView';
import { AudioSystem } from '../audio/AudioSystem';
import { ProjectileView } from '../rendering/ProjectileView';
import { CameraController } from '../rendering/CameraController';

/** 全零输入，仅 pausePressed 用于覆盖层「继续」。 */
function pauseToggleInput(): InputFrame {
  return {
    moveX: 0,
    jumpHeld: false,
    jumpPressed: false,
    attackPressed: false,
    pausePressed: true,
    debugPressed: false,
    restartPressed: false,
    nextLevelPressed: false,
    dropPressed: false,
  };
}

/**
 * 对战场景：薄适配层。
 * 只读模拟状态并同步视图；不做重力、伤害、胜负判定。
 */
export default class GameScene extends Phaser.Scene {
  private loop!: GameLoop;
  private inputMap!: InputMap;
  private arena!: ArenaView;
  private playerView!: EntityView;
  private enemyViews!: EnemyView;
  private afterimage!: AfterimageView;
  private glitchZones!: GlitchZoneView;
  private heapFragments!: HeapFragmentView;
  private heapWarnings!: HeapWarningView;
  private allocWalls!: AllocWallView;
  private fatalCore!: FatalCoreView;
  private bossBanner!: HTMLElement;
  private transitionBand!: HTMLElement;
  private exitView!: ExitView;
  private projectileView!: ProjectileView;
  private cameraCtrl!: CameraController;
  private hud!: HudController;
  private bossBar!: BossBarView;
  private overlay!: OverlayController;
  private audio!: AudioSystem;
  /** 已按它搭建场景的关卡下标；变了就重建场地视图 */
  private builtLevelIndex = -1;
  private readonly unlockAudio = (): void => {
    this.audio?.unlock();
  };

  constructor() {
    super({ key: 'GameScene', active: false });
  }

  create(): void {
    this.loop = new GameLoop();
    this.inputMap = new InputMap();
    this.inputMap.attach();

    this.arena = new ArenaView(
      this,
      this.loop.state.platforms,
      this.loop.state.worldWidth,
      this.loop.state.worldHeight,
    );
    this.exitView = new ExitView(this, this.loop.state.exit);
    this.cameraCtrl = new CameraController(
      this,
      this.loop.state.worldWidth,
      this.loop.state.worldHeight,
    );
    this.playerView = new EntityView(this, 'player');
    this.afterimage = new AfterimageView(this);
    this.enemyViews = new EnemyView(this, this.afterimage);
    this.glitchZones = new GlitchZoneView(this);
    this.heapFragments = new HeapFragmentView(this);
    this.heapWarnings = new HeapWarningView(this);
    this.allocWalls = new AllocWallView(this);
    this.fatalCore = new FatalCoreView(this);
    this.projectileView = new ProjectileView(this);

    const hudRoot = document.getElementById('hud')!;
    const bossBarRoot = document.getElementById('bossbar')!;
    const overlayRoot = document.getElementById('overlay')!;
    this.bossBanner = document.getElementById('bossbanner')!;
    this.transitionBand = document.getElementById('transition-band')!;

    this.audio = new AudioSystem();
    window.addEventListener('pointerdown', this.unlockAudio);
    window.addEventListener('keydown', this.unlockAudio);
    this.hud = new HudController(hudRoot);
    this.bossBar = new BossBarView(bossBarRoot);
    this.overlay = new OverlayController(overlayRoot, {
      onResume: () => {
        // 仅暂停时可点继续；胜负界面不要切回 playing
        if (this.loop.state.match !== 'paused') {
          return;
        }
        // 覆盖层点击时未必采到键盘边沿，直接用 pausePressed 回 playing
        this.loop.step(0, pauseToggleInput());
      },
      onRestart: () => {
        this.loop.reset();
      },
      onNext: () => {
        // 前两关结算/暂停界面的「下一关」
        this.loop.advanceToNextLevel();
      },
    });

    // 场景间显式引用，供 DebugScene 读取；不要另做模块级全局可变状态
    this.registry.set('simState', this.loop.state);
    this.builtLevelIndex = this.loop.state.levelIndex;

    this.scene.launch('DebugScene');

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.onShutdown, this);
  }

  update(_time: number, delta: number): void {
    // 覆盖层点了继续时已在 onResume 处理；此处仍以键盘采样为准
    const input = this.inputMap.sample();
    this.loop.step(delta / 1000, input);

    const state = this.loop.state;
    this.registry.set('simState', state);

    // 换关（F4 调试跳关或通关转场）后重建场地、出口与相机边界
    if (state.levelIndex !== this.builtLevelIndex) {
      this.builtLevelIndex = state.levelIndex;
      this.arena.destroy();
      this.arena = new ArenaView(this, state.platforms, state.worldWidth, state.worldHeight);
      this.exitView.destroy();
      this.exitView = new ExitView(this, state.exit);
      this.cameraCtrl = new CameraController(this, state.worldWidth, state.worldHeight);
    }

    this.playerView.sync(state.player);
    this.enemyViews.sync(state.enemies, state.frame);
    this.afterimage.sync(state.frame);
    this.glitchZones.sync(state.glitchZones, state.frame);
    this.heapFragments.sync(state.fragments, state.frame);
    this.heapWarnings.sync(state.projectiles, state.frame);
    // 墙从主地面向上长；没有地面时退化为玩家站位（walls 为空时无所谓）
    const groundSlab = state.platforms.find((p) => p.h >= 80);
    this.allocWalls.sync(state.walls, state.hazards, groundSlab ? groundSlab.y : state.player.position.y);
    const boss = state.enemies.find((e) => String(e.enemyKind) === 'outOfMemoryError');
    this.fatalCore.sync(boss);
    this.syncBossBanner(state);
    this.exitView.setPhase(
      state.match === 'levelCleared'
        ? 'entered'
        : state.level.exitUnlocked
          ? 'unlocked'
          : 'locked',
    );
    this.projectileView.sync(state.projectiles);
    this.projectileView.syncMuzzleFlash(state.player);
    this.cameraCtrl.update(
      state.player.position.x,
      state.shakeFrames,
      state.frame,
      state.worldWidth,
    );
    this.hud.update(state);
    this.syncBossBar(state);
    this.audio.sync(state);
    this.overlay.update(state);
  }

  /**
   * 只有活着的 outOfMemoryError 才显示 HEAP。
   * defeat / levelCleared 结算时收起；杂兵不画条。
   */
  private syncBossBar(state: {
    match: string;
    enemies: ReadonlyArray<{
      enemyKind: string;
      health: number;
      maxHealth: number;
      behavior: string;
    }>;
  }): void {
    const settling = state.match === 'defeat' || state.match === 'levelCleared';
    const boss = settling
      ? undefined
      : state.enemies.find(
          (enemy) =>
            enemy.health > 0 &&
            enemy.behavior !== 'dead' &&
            String(enemy.enemyKind) === 'outOfMemoryError',
        );
    if (!boss) {
      this.bossBar.update(null, 1);
      return;
    }
    const ratio = boss.maxHealth > 0 ? boss.health / boss.maxHealth : 0;
    const phase: 1 | 2 | 3 = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
    this.bossBar.update(ratio, phase);
  }

  /**
   * Boss 阶段大字：GC PAUSE 与 FATAL。FATAL 转场同时打开扫描线 band。
   */
  private syncBossBanner(state: {
    enemies: ReadonlyArray<{
      enemyKind: string;
      gcFrames?: number;
      bossPhase?: number;
      fatalFrames?: number;
    }>;
  }): void {
    const boss = state.enemies.find(
      (enemy) => String(enemy.enemyKind) === 'outOfMemoryError',
    );
    const fatal = boss !== undefined && (boss.fatalFrames ?? 0) > 0;
    const gc = !fatal && boss !== undefined && (boss.gcFrames ?? 0) > 0;
    this.bossBanner.classList.toggle('visible', fatal || gc);
    this.bossBanner.classList.toggle('fatal', fatal);
    this.transitionBand.classList.toggle('visible', fatal);
    if (fatal) {
      this.bossBanner.textContent = 'FATAL';
      this.bossBanner.setAttribute('aria-hidden', 'false');
      this.transitionBand.setAttribute('aria-hidden', 'false');
    } else if (gc) {
      this.bossBanner.textContent = 'GC PAUSE';
      this.bossBanner.setAttribute('aria-hidden', 'false');
      this.transitionBand.setAttribute('aria-hidden', 'true');
    } else {
      this.bossBanner.setAttribute('aria-hidden', 'true');
      this.transitionBand.setAttribute('aria-hidden', 'true');
    }
  }

  private shutdownDone = false;

  private onShutdown(): void {
    if (this.shutdownDone) {
      return;
    }
    this.shutdownDone = true;
    window.removeEventListener('pointerdown', this.unlockAudio);
    window.removeEventListener('keydown', this.unlockAudio);
    this.inputMap?.detach();
    this.hud?.destroy();
    this.bossBar?.destroy();
    this.overlay?.destroy();
    this.playerView?.destroy();
    this.enemyViews?.destroy();
    this.afterimage?.destroy();
    this.glitchZones?.destroy();
    this.heapFragments?.destroy();
    this.heapWarnings?.destroy();
    this.allocWalls?.destroy();
    this.fatalCore?.destroy();
    this.projectileView?.destroy();
    this.arena?.destroy();
  }
}
