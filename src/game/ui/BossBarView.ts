/**
 * Boss 专属的屏幕顶部 HEAP 条。
 * 只服务 outOfMemoryError，不给杂兵画血条。
 */
export class BossBarView {
  private readonly root: HTMLElement;
  private fill: HTMLElement | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.build();
  }

  /**
   * ratio 为 null 时收起（没有活着的 Boss，或正在结算）。
   * phase 1 保持默认绿，2 / 3 靠 phase-2 / phase-3。
   */
  update(ratio: number | null, phase: 1 | 2 | 3): void {
    if (ratio === null || !this.fill) {
      this.root.classList.remove('visible');
      this.root.setAttribute('aria-hidden', 'true');
      return;
    }

    const clamped = Math.max(0, Math.min(1, ratio));
    this.fill.style.width = `${clamped * 100}%`;
    this.fill.classList.remove('phase-2', 'phase-3');
    if (phase === 2) {
      this.fill.classList.add('phase-2');
    } else if (phase === 3) {
      this.fill.classList.add('phase-3');
    }
    this.root.classList.add('visible');
    this.root.setAttribute('aria-hidden', 'false');
  }

  /** 清掉内部节点，保留 #bossbar 容器供场景重开。 */
  destroy(): void {
    this.root.classList.remove('visible');
    this.root.setAttribute('aria-hidden', 'true');
    this.root.replaceChildren();
    this.fill = null;
  }

  private build(): void {
    this.root.replaceChildren();
    this.root.classList.remove('visible');
    this.root.setAttribute('aria-hidden', 'true');

    const label = document.createElement('div');
    label.className = 'bossbar-label';
    label.textContent = 'HEAP';

    const track = document.createElement('div');
    track.className = 'bossbar-track';

    const fill = document.createElement('div');
    fill.className = 'bossbar-fill';
    fill.style.width = '0%';

    // 66% / 33% 阶段刻度，按冻结接口放在 34% 与 67%
    const tick66 = document.createElement('div');
    tick66.className = 'bossbar-tick';
    tick66.style.left = '34%';

    const tick33 = document.createElement('div');
    tick33.className = 'bossbar-tick';
    tick33.style.left = '67%';

    track.append(fill, tick66, tick33);
    this.root.append(label, track);
    this.fill = fill;
  }
}
