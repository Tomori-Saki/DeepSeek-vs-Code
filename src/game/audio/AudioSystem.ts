import { AUDIO_FILES, type AudioEvent } from '../assets/manifest';
import type { GameState } from '../simulation/GameState';

interface AudioMemory {
  playerHealth: number;
  match: GameState['match'];
  exitUnlocked: boolean;
  projectileId: number;
  enemies: { id: string; health: number; behavior: string }[];
}

/**
 * 本地短音效。文件缺失或浏览器拦截自动播放时静默跳过，不打断游戏。
 * 状态音只在转场时播一次。
 */
export class AudioSystem {
  private unlocked = false;
  private readonly clips = new Map<AudioEvent, HTMLAudioElement>();
  private memory: AudioMemory | null = null;

  constructor() {
    for (const file of AUDIO_FILES) {
      const audio = new Audio(file.url);
      audio.preload = 'auto';
      audio.volume = 0.45;
      this.clips.set(file.event, audio);
    }
  }

  /** 第一次点击或按键后才允许出声。 */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    for (const clip of this.clips.values()) {
      clip.play()
        .then(() => {
          clip.pause();
          clip.currentTime = 0;
        })
        .catch(() => {
          // 素材缺失或自动播放策略拒绝时保持静默。
        });
    }
  }

  sync(state: GameState): void {
    if (!this.memory) {
      this.memory = snapshot(state);
      return;
    }
    const prev = this.memory;
    const next = snapshot(state);

    if (next.match === 'defeat' && prev.match !== 'defeat') {
      this.play('player-death');
    } else if (next.match === 'levelCleared' && prev.match !== 'levelCleared') {
      this.play('level-clear');
    } else if (next.playerHealth < prev.playerHealth) {
      this.play('player-hurt');
    }

    if (next.exitUnlocked && !prev.exitUnlocked) this.play('exit-unlock');
    if (next.projectileId > prev.projectileId) {
      const newest = state.projectiles.find((proj) => proj.id === next.projectileId - 1);
      this.play(newest?.ownerId === 'enemy' ? 'warning-shot' : 'shoot');
    }

    for (const enemy of next.enemies) {
      const old = prev.enemies.find((item) => item.id === enemy.id);
      if (!old) continue;
      if (enemy.behavior === 'dead' && old.behavior !== 'dead') this.play('enemy-death');
      else if (enemy.health < old.health && enemy.behavior !== 'dead') this.play('enemy-hurt');
    }

    this.memory = next;
  }

  private play(event: AudioEvent): void {
    if (!this.unlocked) return;
    const clip = this.clips.get(event);
    if (!clip) return;
    clip.currentTime = 0;
    clip.play().catch(() => {
      // 单次播放失败不抛到控制台以外，也不要中断帧循环。
    });
  }
}

function snapshot(state: GameState): AudioMemory {
  return {
    playerHealth: state.player.health,
    match: state.match,
    exitUnlocked: state.level.exitUnlocked,
    projectileId: state.nextProjectileId,
    enemies: state.enemies.map((enemy) => ({
      id: enemy.id,
      health: enemy.health,
      behavior: enemy.behavior,
    })),
  };
}
