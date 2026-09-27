import type { InputFrame } from '../simulation/GameLoop';

/**
 * 键盘输入映射：持续键保存在实例内，边沿键在 sample() 时消费清空。
 * 不使用全局可变单例。
 */
export class InputMap {
  private target: EventTarget | null = null;
  private leftHeld = false;
  private rightHeld = false;
  private jumpHeld = false;
  private jumpPressed = false;
  private attackPressed = false;
  private pausePressed = false;
  private debugPressed = false;
  private restartPressed = false;
  private nextLevelPressed = false;
  /** S/下方向：从薄平台直接落下的边沿 */
  private dropPressed = false;

  constructor() {}

  /** 挂到目标（默认 window）上监听键盘和鼠标左键 */
  attach(target?: EventTarget): void {
    this.detach();
    this.target = target ?? window;
    this.target.addEventListener('keydown', this.handleKeyDown as EventListener);
    this.target.addEventListener('keyup', this.handleKeyUp as EventListener);
    this.target.addEventListener('mousedown', this.handleMouseDown);
  }

  /** 移除监听，避免重复 attach 后多次触发 */
  detach(): void {
    if (!this.target) return;
    this.target.removeEventListener('keydown', this.handleKeyDown as EventListener);
    this.target.removeEventListener('keyup', this.handleKeyUp as EventListener);
    this.target.removeEventListener('mousedown', this.handleMouseDown);
    this.target = null;
  }

  /**
   * 返回当前输入快照，并清掉全部边沿位；持续键（方向、jumpHeld）保留。
   */
  sample(): InputFrame {
    let moveX: -1 | 0 | 1 = 0;
    if (this.leftHeld && !this.rightHeld) moveX = -1;
    else if (this.rightHeld && !this.leftHeld) moveX = 1;

    const frame: InputFrame = {
      moveX,
      jumpHeld: this.jumpHeld,
      jumpPressed: this.jumpPressed,
      attackPressed: this.attackPressed,
      pausePressed: this.pausePressed,
      debugPressed: this.debugPressed,
      restartPressed: this.restartPressed,
      nextLevelPressed: this.nextLevelPressed,
      dropPressed: this.dropPressed,
    };

    this.jumpPressed = false;
    this.attackPressed = false;
    this.pausePressed = false;
    this.debugPressed = false;
    this.restartPressed = false;
    this.nextLevelPressed = false;
    this.dropPressed = false;

    return frame;
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    const code = event.code;

    // 防止页面滚动 / 浏览器搜索等默认行为
    if (
      code === 'Space' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight' ||
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'F3' ||
      code === 'F4' ||
      code === 'Escape'
    ) {
      event.preventDefault();
    }

    // 持续方向与跳跃按住
    if (code === 'KeyA' || code === 'ArrowLeft') this.leftHeld = true;
    if (code === 'KeyD' || code === 'ArrowRight') this.rightHeld = true;
    if (code === 'Space') this.jumpHeld = true;

    // 边沿只在首次按下（非 repeat）时置位
    if (event.repeat) return;

    if (code === 'Space') this.jumpPressed = true;
    // S/下方向：下蹲，从薄平台直接落下
    if (code === 'KeyS' || code === 'ArrowDown') this.dropPressed = true;
    // J/Z 仍可作为兼容开火，主操作是鼠标左键
    if (code === 'KeyJ' || code === 'KeyZ') this.attackPressed = true;
    if (code === 'Escape') this.pausePressed = true;
    if (code === 'F3') this.debugPressed = true;
    if (code === 'F4') this.nextLevelPressed = true;
    if (code === 'KeyR') this.restartPressed = true;
  };

  /** 左键只产生一次攻击边沿；按住不会连发。不调用 preventDefault。 */
  private handleMouseDown = (event: Event): void => {
    const button = 'button' in event ? (event as MouseEvent).button : 0;
    if (button !== 0) return;
    this.attackPressed = true;
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    const code = event.code;
    if (code === 'KeyA' || code === 'ArrowLeft') this.leftHeld = false;
    if (code === 'KeyD' || code === 'ArrowRight') this.rightHeld = false;
    if (code === 'Space') this.jumpHeld = false;
  };
}
