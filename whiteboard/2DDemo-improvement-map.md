# 「大肥鱼大战代码」2D 射击 Demo · 改进全景图

> 审查范围：模拟层 18 文件 · 渲染/场景/UI 12 文件 · 资源/输入/音频/工程配置
> 共 30+ 项发现，按「可通关性 → 体验 → 工程化」分级
>
> **修复状态标记**：✅ 已修复 · 🔁 复查为误报 ·（未标记 = 待修）

---

## 一、优先修复 Top 3 —— 直接影响可通关性

| # | 问题 | 细节 | 位置 |
|---|---|---|---|
| ① | **敌人被击退出平台坠落** ✅ 已修复 | 受击期间不判定 support，可冲出平台边缘掉坑；坠落无死亡判定 → 出口永不解锁，关卡死锁 | [EnemySystem.ts#L37](../src/game/simulation/EnemySystem.ts#L37) · [LevelSystem.ts#L9](../src/game/simulation/LevelSystem.ts#L9) |
| ② | **Boss 冲撞对玩家无伤害判定** ✅ 已修复 | P3 冲撞 600px/s 全程无碰撞结算，纯演出；站桩无伤，威胁设计失效 → 建议加扫掠判定盒 | [BossSystem.ts#L302-L348](../src/game/simulation/BossSystem.ts#L302) |
| ③ | **GC PAUSE 期间可白嫖 Boss** ✅ 已修复 | 冻结 300 帧仅停 Boss 行动，不挡玩家伤害；约 300 伤害直接从 66% 跳到 33%，P2 形同虚设 | [BossSystem.ts#L109](../src/game/simulation/BossSystem.ts#L109) · [CombatSystem.ts#L289](../src/game/simulation/CombatSystem.ts#L289) |

---

## 二、模拟层 · Simulation

- 【中】**accumulator 无上限 → 低帧率永久慢动作**：子步上限 5 但 `maxFrameDt=0.1` 允许单帧 6 步需求，持续低帧率时无界增长，超限应清零累积器 — [GameLoop.ts#L77-L96](../src/game/simulation/GameLoop.ts#L77)
- 【中】**hitStop 冻结吞掉跳跃/攻击边沿输入**：4 帧冻结期间 jump/attack/dropPressed 被静默丢弃，且无攻击输入缓冲，连段丢键 — [GameLoop.ts#L142](../src/game/simulation/GameLoop.ts#L142)
- 【中】**每帧对象分配热点**：syncHurtbox 每实体每帧新建 Aabb 3-5 次（moveAndCollide / resolveCombat / resolveProjectileHits 重复同步），BossSystem 每帧 filter+sort — [EntityState.ts#L47](../src/game/simulation/EntityState.ts#L47)
- 【中】**AI 与弹道判定缺陷** ✅ 已修复：远程 AI 无 dy 判定对高台玩家无效开火；`platformAt` 不判方向，弹丸上穿也 landed，Boss 站浮台下方时 heap 弹静默销毁 — [EnemySystem.ts#L224](../src/game/simulation/EnemySystem.ts#L224) · [CombatSystem.ts#L95](../src/game/simulation/CombatSystem.ts#L95)
- 【低】**死配置双源误导** ✅ 已修复：config.ts 中 playerDamage、enemyAttack* 系列、enemyMaxHealth、PLATFORMS 等均无引用，真实数值在 `EnemyState.KIND` 表，调参必踩坑 — [config.ts#L33-L73](../src/game/config.ts#L33)
- 【低】**重复代码与尸体堆积** ✅ 已修复：applyGravity×3、「扣血+击退+硬直+无敌+闪白+震屏」样板×4（应抽 `damagePlayer()`）；死敌人永留 `enemies` 数组每帧参与遍历 — [GameLoop.ts#L352](../src/game/simulation/GameLoop.ts#L352)

## 三、渲染与 UI · Rendering

- 【高】**水平相机与震屏完全失效** 🔁 复查为误报：实测（玩家传送到 x=1500 后 scrollX 收敛至 1019 ≈ 理论值 1020，maxScroll=1640 生效；shakeFrames 触发 ±5px 水平抖动）相机跟随与震屏均正常。原审查把画布尺寸 `SIM.worldWidth=960` 误当成关卡世界宽（level1 实为 2600） — [main.ts#L12](../src/main.ts#L12) · [CameraController.ts#L19](../src/game/rendering/CameraController.ts#L19)
- 【中】**残影频繁 create/destroy**：超限直接 `destroy()` 最旧精灵，高频冲刺造成 WebGL 缓冲抖动 → 改 12 精灵池轮转复用 — [AfterimageView.ts#L41](../src/game/rendering/AfterimageView.ts#L41)
- 【中】**HUD 每帧 DOM 写入且半心失真**：每帧 15 次 classList 无效写入；`.heart-partial` 固定 50% 渐变，血量 21~39 均显示半心 → diff 缓存 + 按实际百分比设宽 — [HudController.ts#L31](../src/game/ui/HudController.ts#L31)
- 【中】**预警圈每帧约 565 次 fillRect**：半径 90 时逐帧重绘矩形 → 预渲染虚线圈纹理，用缩放/透明度表现收缩 — [HeapWarningView.ts#L102](../src/game/rendering/HeapWarningView.ts#L102)
- 【中】**流程体验缺口**：无加载进度（黑屏直进战斗）、无主菜单、无音量设置；DebugScene 未随 GameScene 关闭、registry 残留旧 simState — [PreloadScene.ts](../src/game/scenes/PreloadScene.ts) · [GameScene.ts#L131](../src/game/scenes/GameScene.ts#L131)
- 【低】**移动端与打击感**：无触摸/手柄支持；无命中火花、落地灰尘、死亡碎屑等粒子（Phaser 粒子发射器成本很低）；攻击缺独立枪口光效贴图

## 四、资源 · 输入 · 音频 · 工程

- 【高】**资源路径冲突 → 子目录部署全 404** ✅ 已修复：manifest 全部用根绝对路径 `/assets/...`，而 vite 设 `base:'./'`，子目录部署时资源全部加载失败 → 统一相对路径或加 `import.meta.env.BASE_URL` — [manifest.ts#L33](../src/game/assets/manifest.ts#L33) · [vite.config.ts#L4](../vite.config.ts#L4)
- 【高】**窗口失焦输入残留**：无 `blur`/`visibilitychange` 监听，按住 A/Space 后 Alt+Tab 返回后角色持续移动 → 失焦时清空全部 held 状态 — [InputMap.ts#L72-L120](../src/game/input/InputMap.ts#L72)
- 【中】**音频系统原始**：HTMLAudio 同一 clip 复用互相打断、无法叠加；音量 0.45 硬编码无静音/音量设置；全项目无 BGM → 改 Phaser 内置 WebAudio — [AudioSystem.ts#L25](../src/game/audio/AudioSystem.ts#L25)
- 【中】**清单与实际文件不一致**：manifest 声明 hurt.png/dead.png 但文件不存在，每次预载 404 再走占位兜底 → 剔除加载或补图；建议加一个 glob 比对校验脚本 — [manifest.ts#L69](../src/game/assets/manifest.ts#L69)
- 【中】**打包冗余与体积**：3.4MB 候选素材（fx/candidates、enemy/candidates、180 张未引用瓦片）被打进 dist；生产 sourcemap 直出、Phaser 未拆 chunk，单 JS >1.5MB — [public/assets](../public/assets)
- 【低】**工程化缺口**：缺 eslint/vitest，tsconfig 只含 `src`（verify 脚本类型错误不被检查）；无 CI 门禁；mousedown 绑 window 点 UI 也开火；start.bat 浏览器先于 dev server 打开

---

## 五、已经做得不错的地方

- 模拟/渲染分离架构清晰，纯函数参数化到位，池化意识好
- verify-sim 回归测试 80+ 项，覆盖四类敌人 AI 与 Boss 全机制（缺口：InputMap 键位与 blur 清理、manifest 一致性、变步长路径）
- 素材合规：Kenney CC0 瓦片 + 自制 AI 立绘，风格统一

## 六、建议修复顺序

1. **修 Top3 可通关性 bug**（坠落死锁 / Boss 冲撞判定 / GC 无敌）
2. **统一资源相对路径**，清理死配置与冗余候选素材
3. **打击感升级**：加命中火花、枪口光效、落地灰尘（相机震屏复查正常，无需修）
4. **工程化**：引入 eslint + vitest 接 CI，构建拆分 Phaser chunk
5. **体验补全**：主菜单、加载进度、音量设置、移动端触摸适配
