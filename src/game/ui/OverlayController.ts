import { hasNextLevel } from '../levels';
import type { GameState } from '../simulation/GameState';

export interface OverlayHandlers {
  onResume: () => void;
  onRestart: () => void;
  /** 前两关的「下一关」按钮 */
  onNext: () => void;
}

/**
 * 暂停 / 胜负遮罩：控制 #overlay 的 visible，以及按钮显隐与回调。
 * 前两关（还有下一关时）不提供「重新开始」，第二个按钮换成「下一关」。
 */
export class OverlayController {
  private readonly root: HTMLElement;
  private readonly handlers: OverlayHandlers;
  private titleEl: HTMLElement | null = null;
  private hintEl: HTMLElement | null = null;
  private resumeBtn: HTMLButtonElement | null = null;
  private restartBtn: HTMLButtonElement | null = null;
  private bannerEl: HTMLElement | null = null;
  private lastMatch: GameState['match'] | null = null;
  private lastLevelIndex: number | null = null;
  /** 第二个按钮当前是「下一关」还是「重新开始」 */
  private buttonMode: 'next' | 'restart' = 'restart';

  constructor(root: HTMLElement, handlers: OverlayHandlers) {
    this.root = root;
    this.handlers = handlers;
    this.build();
  }

  /** 按 match 切换标题、按钮与 visible */
  update(state: GameState): void {
    const match = state.match;
    if (match === this.lastMatch && state.levelIndex === this.lastLevelIndex) return;
    this.lastMatch = match;
    this.lastLevelIndex = state.levelIndex;
    const canAdvance = hasNextLevel(state.levelIndex);

    if (match === 'playing' || match === 'transitioning') {
      this.root.classList.remove('visible');
      this.bannerEl?.classList.remove('endcard-error', 'endcard-ok');
      if (this.resumeBtn) this.resumeBtn.hidden = true;
      if (this.restartBtn) this.restartBtn.hidden = true;
      return;
    }

    this.root.classList.add('visible');

    if (match === 'paused') {
      if (this.titleEl) this.titleEl.textContent = '暂停';
      if (this.hintEl) {
        this.hintEl.textContent =
          'A/D 或方向键移动，空格跳跃，S 下蹲穿台，鼠标左键攻击，Esc 暂停，R 重开，F3 调试';
      }
      this.setSecondButton(canAdvance ? 'next' : 'restart');
      if (this.resumeBtn) this.resumeBtn.hidden = false;
      if (this.restartBtn) this.restartBtn.hidden = false;
      return;
    }

    if (match === 'victory' || match === 'levelCleared') {
      if (this.titleEl) this.titleEl.textContent = '';
      if (this.bannerEl) {
        this.bannerEl.textContent = 'SUCCEEDED';
        this.bannerEl.classList.remove('endcard-error');
        this.bannerEl.classList.add('endcard-ok');
      }
      if (this.hintEl) {
        this.hintEl.textContent = hasNextLevel(state.levelIndex)
          ? '正在载入下一关…'
          : '全部关卡通关。';
      }
      this.setSecondButton('next');
      if (this.resumeBtn) this.resumeBtn.hidden = true;
      // 最后一关通关会自动回第一关，不再给按钮
      if (this.restartBtn) this.restartBtn.hidden = !canAdvance;
      return;
    }

    if (this.titleEl) this.titleEl.textContent = '';
    if (this.bannerEl) {
      this.bannerEl.textContent = 'ERROR';
      this.bannerEl.classList.remove('endcard-ok');
      this.bannerEl.classList.add('endcard-error');
    }
    if (this.hintEl) {
      this.hintEl.textContent = '掉出场地或生命耗尽。';
    }
    // 死亡一律重新开始当前关，不能靠死进下一关
    this.setSecondButton('restart');
    if (this.resumeBtn) this.resumeBtn.hidden = true;
    if (this.restartBtn) this.restartBtn.hidden = false;
  }

  /** 切换第二个按钮的文案、配色与行为 */
  private setSecondButton(mode: 'next' | 'restart'): void {
    this.buttonMode = mode;
    if (!this.restartBtn) return;
    this.restartBtn.textContent = mode === 'next' ? '下一关' : '重新开始';
    this.restartBtn.classList.toggle('overlay-next', mode === 'next');
  }

  /** 清空 root 并解除按钮监听 */
  destroy(): void {
    if (this.resumeBtn) {
      this.resumeBtn.removeEventListener('click', this.handleResume);
    }
    if (this.restartBtn) {
      this.restartBtn.removeEventListener('click', this.handleRestart);
    }
    this.root.classList.remove('visible');
    this.root.replaceChildren();
    this.titleEl = null;
    this.bannerEl = null;
    this.hintEl = null;
    this.resumeBtn = null;
    this.restartBtn = null;
    this.lastMatch = null;
    this.lastLevelIndex = null;
  }

  private build(): void {
    this.root.replaceChildren();
    this.root.classList.remove('visible');

    const panel = document.createElement('div');
    panel.className = 'overlay-panel';

    this.titleEl = document.createElement('h2');
    this.titleEl.className = 'overlay-title';

    this.bannerEl = document.createElement('div');
    this.bannerEl.className = 'endcard';

    this.hintEl = document.createElement('p');
    this.hintEl.className = 'overlay-hint';
    this.hintEl.textContent =
      'A/D 或方向键移动，空格跳跃，S 下蹲穿台，鼠标左键攻击，Esc 暂停，R 重开，F3 调试';

    const actions = document.createElement('div');
    actions.className = 'overlay-actions';

    this.resumeBtn = document.createElement('button');
    this.resumeBtn.type = 'button';
    this.resumeBtn.className = 'overlay-resume';
    this.resumeBtn.textContent = '继续';
    this.resumeBtn.addEventListener('click', this.handleResume);

    this.restartBtn = document.createElement('button');
    this.restartBtn.type = 'button';
    this.restartBtn.className = 'overlay-restart';
    this.restartBtn.textContent = '重新开始';
    this.restartBtn.addEventListener('click', this.handleRestart);

    actions.append(this.resumeBtn, this.restartBtn);
    panel.append(this.titleEl, this.bannerEl, this.hintEl, actions);
    this.root.appendChild(panel);
  }

  private handleResume = (): void => {
    this.handlers.onResume();
  };

  private handleRestart = (): void => {
    // 「下一关」只在暂停和通关界面出现；死亡永远是重新开始当前关
    if (this.buttonMode === 'next') {
      this.handlers.onNext();
      return;
    }
    this.handlers.onRestart();
  };
}
