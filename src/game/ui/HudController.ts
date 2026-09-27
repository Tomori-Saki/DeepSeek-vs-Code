import type { GameState } from '../simulation/GameState';

const HEARTS = 5;
const HEART_HP = 20;

export interface HudOptions {
  /** 角色名可替换，组件内部不再写死。 */
  playerName?: string;
}

/**
 * 视口左上角的 DOM 爱心。不随相机滚动，也不显示敌人血条。
 * heart-full / heart-empty / heart-partial 之后可以换成图片。
 */
export class HudController {
  private readonly root: HTMLElement;
  private readonly playerName: string;
  private hearts: HTMLElement[] = [];
  private statusText: HTMLElement | null = null;
  private slowText: HTMLElement | null = null;
  private tutorialText: HTMLElement | null = null;

  constructor(root: HTMLElement, options: HudOptions = {}) {
    this.root = root;
    this.playerName = options.playerName ?? '旅人';
    this.build();
  }

  update(state: GameState): void {
    const hp = Math.max(0, state.player.health);
    for (let i = 0; i < this.hearts.length; i++) {
      const heart = this.hearts[i];
      const start = i * HEART_HP;
      heart.classList.remove('heart-full', 'heart-empty', 'heart-partial');
      if (hp >= start + HEART_HP) heart.classList.add('heart-full');
      else if (hp > start) heart.classList.add('heart-partial');
      else heart.classList.add('heart-empty');
    }
    if (this.statusText) {
      this.statusText.textContent =
        state.match === 'paused' ? '已暂停' : state.level.exitUnlocked ? '出口开启' : '';
    }
    // 故障场减速指示：只在 slowFrames > 0 时显示
    this.slowText?.classList.toggle('visible', state.player.slowFrames > 0);
    // 新手教程只在第一关显示
    this.tutorialText?.classList.toggle('visible', state.levelIndex === 0);
  }

  destroy(): void {
    this.root.replaceChildren();
    this.hearts = [];
    this.statusText = null;
    this.slowText = null;
    this.tutorialText = null;
  }

  private build(): void {
    this.root.replaceChildren();
    const side = document.createElement('div');
    side.className = 'hud-side hud-player';

    const label = document.createElement('div');
    label.className = 'hud-label';
    label.textContent = this.playerName;

    const row = document.createElement('div');
    row.className = 'heart-row';
    this.hearts = [];
    for (let i = 0; i < HEARTS; i++) {
      const heart = document.createElement('span');
      heart.className = 'heart heart-empty';
      heart.setAttribute('aria-hidden', 'true');
      row.appendChild(heart);
      this.hearts.push(heart);
    }

    this.statusText = document.createElement('div');
    this.statusText.className = 'hud-status';

    this.slowText = document.createElement('div');
    this.slowText.className = 'hud-slow';
    this.slowText.textContent = 'SLOW';

    this.tutorialText = document.createElement('div');
    this.tutorialText.className = 'hud-tutorial';
    this.tutorialText.textContent = 'A/D 移动 · 空格 跳跃 · 左键 攻击 · S 下蹲';

    side.append(label, row, this.slowText, this.tutorialText, this.statusText);
    this.root.append(side);
  }
}
