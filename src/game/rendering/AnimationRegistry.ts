import Phaser from 'phaser';
import { PLAYER_ANIMS, type AnimSource } from '../assets/manifest';

/**
 * 根据 manifest（素材清单）注册动画。
 * 不在游戏代码里写死磁盘路径，只读 key。
 * 占位图（单帧）即使 manifest 写了 frameCount>1，也按单帧注册。
 */
function registerOne(scene: Phaser.Scene, anim: AnimSource): void {
  if (!scene.textures.exists(anim.key)) {
    return;
  }

  // 已注册则跳过，避免 Preload 重入时报错
  if (scene.anims.exists(anim.key)) {
    return;
  }

  const texture = scene.textures.get(anim.key);
  // 排除 __BASE 后的帧数；真正的 spritesheet 会 >1
  const sheetFrameCount = texture.getFrameNames(false).length;

  const useSheet =
    anim.frameWidth != null &&
    anim.frameHeight != null &&
    anim.frameCount > 1 &&
    sheetFrameCount > 1;

  if (useSheet) {
    const last = Math.min(anim.frameCount, sheetFrameCount) - 1;
    scene.anims.create({
      key: anim.key,
      frames: scene.anims.generateFrameNumbers(anim.key, {
        start: 0,
        end: last,
      }),
      frameRate: anim.frameRate,
      repeat: anim.repeat,
    });
    return;
  }

  // 缺省 frameWidth/frameHeight，或占位单帧：整张图注册成同名 animation
  scene.anims.create({
    key: anim.key,
    frames: [{ key: anim.key }],
    frameRate: anim.frameRate,
    repeat: anim.repeat,
  });
}

export function registerAll(scene: Phaser.Scene): void {
  for (const anim of PLAYER_ANIMS) {
    registerOne(scene, anim);
  }
}
