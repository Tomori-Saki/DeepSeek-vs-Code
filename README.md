# 大肥鱼大战代码（DeepSeek vs Code）

一个 Phaser 3 + TypeScript 的 2D 横版动作小游戏：扮演大肥鱼，一路开枪修掉各种「编码报错拟人」的敌人，最后干掉内存溢出大 Boss。

## 玩法

### 操作

| 按键 | 动作 |
|---|---|
| A / D 或方向键 | 左右移动 |
| 空格 | 跳跃（原地垂直起跳，平台可以从下面穿上来） |
| 鼠标左键 | 手枪射击 |
| S 或下方向 | 下蹲：站在薄平台上时直接穿台落下 |
| Esc | 暂停 |
| R | 重开当前关 |
| F3 / F4 | 调试开关 / 调试跳关 |

### 关卡

- **第一关 SYNTAX ERROR**：教学关，认识四类杂兵。
- **第二关 RUNTIME GLITCH**：三组编队考试——故障场、窄门打断、控制+远程组合。
- **第三关 OUT OF MEMORY**：Boss 房。Boss 会吐内存碎片、用两堵内存墙挤压场地；66% 血触发 GC PAUSE，33% 血破壳进入冲撞形态。打死它后回到第一关循环。

### 敌人图鉴

| 敌人 | 手段 |
|---|---|
| SyntaxError | 中距离突进 + 二连斩 | 
| NullPointerException | 远程发射 NULL 弹，贴脸就后退 | 
| StackOverflowError | 每攻击一次叠一层，满层放大招 | 
| RuntimeGlitch | 瞬移到你身边劈一刀，落点留减速故障场 | 
| OutOfMemoryError（Boss） | 抛物线弹、内存墙、横扫波、冲撞、召唤 | 

死亡会回到当前关重来；通关一关自动进入下一关。

## 启动方式

### 一键启动（Windows）

双击根目录的 `start.bat`：首次运行会自动安装依赖，然后启动开发服务器并打开浏览器。

### 手动启动

```bash
npm install
npm run dev
```

然后打开 http://localhost:5173/ 。

### 其他命令

```bash
npm run build          # 类型检查 + 打包到 dist/
npm run preview        # 预览打包结果
npm run verify:sim     # 模拟层回归测试
npm run verify:visual  # 敌人表现层回归测试
```

## 备注

- 平台底部穿透是设定：上升时不挡底面、下降才落顶面，不要改回去。
- 素材：场景瓦片与 UI 按钮来自 Kenney（CC0），像素字体 Press Start 2P（OFL），角色与 Boss 贴图为本项目自制。
