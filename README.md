# Liminal

把终端的输入输出映射成聊天气泡。**架构核心原则:以真实终端状态为事实来源(source of truth),分类器/标注只负责选择增强视图;任何增强失败都降级为可用的终端交互。**

设计方案见 `docs/`。当前实现已完成**阶段一至阶段四**,提供 Web 与桌面(Electron)两种形态,核心代码同一份。

## 运行

### 桌面版(推荐)

```bash
npm install
npm run desktop     # 构建并启动独立桌面应用
```

Electron 主进程在随机本地端口拉起 Fastify 服务(用 Electron 自带 Node 运行,不依赖系统 Node),
窗口加载该地址;关闭窗口即退出,PTY/bash 随之清理。系统依赖:python3(PTY 桥)、bash。

### 打包 rpm(安装到 Fedora / Nobara 系)

```bash
npm install
npm run dist:rpm   # 构建 server+web+desktop,产出 desktop/release/Liminal-<版本>.x86_64.rpm
```

用 electron-builder 生成,已声明依赖 `python3` 与 `bash`。安装:

```bash
sudo dnf install ./desktop/release/Liminal-0.1.0.x86_64.rpm
```

安装后可从应用菜单启动,或命令行运行 `liminal`。若打包环境的 `~/.cache` 只读,需先设
`ELECTRON_BUILDER_CACHE` 与 `ELECTRON_CACHE` 到可写目录。

### Web 版

```bash
npm install
npm run build        # 构建 server + web
npm start            # http://127.0.0.1:7788

# 或开发模式(热重载,web 在 5173,代理 /ws 到 7788)
npm run dev
```

### Web 版鉴权与隔离(阶段四)

默认只监听 `127.0.0.1`，不启用令牌。若通过反向代理或其他方式暴露 Web 版，必须设置访问令牌：

```bash
LIMINAL_AUTH_TOKEN='自行生成的高强度随机令牌' npm start
```

浏览器以 `http://127.0.0.1:7788/?token=令牌` 打开；令牌会同时用于 API 请求与 WebSocket 握手。桌面版每次启动自动生成并注入一次性令牌，无需手动配置。

可选的本机隔离执行使用 Bubblewrap；它会禁用网络、将宿主根目录只读挂载，仅允许指定工作目录和会话临时目录写入：

```bash
LIMINAL_SANDBOX=bwrap LIMINAL_WORKSPACE="$PWD" npm start
```

该模式要求系统已安装 `bwrap`，且内核/系统策略允许用户命名空间。隔离启动失败时会直接结束该会话，不会回退为宿主机执行。

## 测试

```bash
# 先启动服务(或桌面版,从日志/ss 找内部端口),然后:
npm run test:ws      # WS 协议端到端:命令边界/退出码/cwd/Ctrl+C/resize/真相层
```

## 架构(阶段一)

```
desktop(Electron)              独立桌面应用:主进程在随机本地端口拉起服务子进程
 │                              (ELECTRON_RUN_AS_NODE,打包后不依赖系统 Node),窗口加载之
 ├─ web(React 18 + TS + Tailwind + Zustand + react-virtuoso + xterm.js)
 │   ├─ 真相层  truth/layer.ts   回放缓冲(4MB)+ 常驻无头 xterm 状态机
 │   │                            + 可拆卸的可见终端(“终端视图”按钮 = 降级路径)
 │   └─ 增强层  store.ts 等      聊天气泡:指令/输出/错误气泡、折叠、停止按钮
 └─ server(Fastify + @fastify/websocket)
     ├─ PTY 会话  sessions.ts    每条 WS 连接 = 一个 bash 会话
     ├─ PTY 桥    bin/pty_bridge.py + pythonPty.ts
     │            python3 pty.fork + TIOCSWINSZ,接口对齐 node-pty;
     │            (本机缺 g++,装好编译链后可无痛换回 node-pty)
     ├─ shell 集成  shell/rcfile.bash
     │            注入 OSC 133 标记(A/B/C/D):bash 自己报告命令边界与退出码,
     │            兼容 starship 等动态提示符框架
     └─ 标注器    osc133.ts      旁路扫描字节流 → 结构化事件(命令文本/输出/退出码/cwd),
                                 80ms 节流、200KB 截断;任何异常只降级气泡,不影响字节流
```

数据流主干:`PTY 原始字节 → WS raw 消息(base64) → 前端真相层`,永不过滤、永不改写;
结构化标注事件走旁路,坏了只是少个气泡,顶部的“终端视图”按钮随时可以退回完整终端。

## 已实现(阶段一至阶段三)

### 阶段一(MVP)
- 命令气泡(右对齐、显示 cwd 与时间)+ 输出气泡(等宽、超 30 行头尾保留折叠中间)
- 错误气泡:非零退出码红色标注 + 耗时
- 运行中状态 + 停止按钮 / 输入框 Ctrl+C(发送 `\x03`)
- 命令运行中,输入框切换为 stdin 模式(可回答程序提问)
- 输入框 Tab 补全:服务端辅助 bash 进程跑 `compgen`(跟随会话 cwd、不污染会话),
  命令位/文件位自动区分,多候选弹层(Tab 循环、↑↓ 选择、Enter 确认)
- 断线自动重连(会话不持久化,重连即新 bash)
- 终端视图:真相层的可见形态,重放完整历史,键盘直连 PTY,resize 同步(TIOCSWINSZ)

### 阶段二(核心差异化能力)
- **全屏/TUI 程序**:双通道识别——① 备用屏转义序列(1049/1047/47,覆盖 vim/less/htop);
  ② TUI 名单(claude/codex/gemini/agy(Antigravity)/opencode/goose/amp/q/kiro/cursor-agent/
  copilot/kimi/openclaw/crush/openhands/droid 等 AI CLI 是内联渲染不发备用屏序列,
  按命令名识别,穿透 sudo/env/路径前缀)。命中即自动切终端视图(键盘直连 PTY),
  退出自动返回对话,聊天流留下系统提示;备用屏抖动(启动期 1049h→l→h)有 400ms
  宽限吸收,命令结束强制收敛(程序崩溃没发 1049l 也不会卡在全屏态)
- **交互输入组件**:命令运行中"输出静默 + 行尾无换行 + 提示符特征"启发式识别,
  区分密码(password 遮罩输入)/ 确认((y/n) 是/否按钮)/ 文本(行内输入),
  直接在气泡内作答;提交后遮蔽显示,历史不暴露明文
- **流式输出 \r 折叠**:进度条类单行重写("50%\r75%")只保留最终态,不再逐次成行

### 通用能力
- **设置面板**(顶栏齿轮):主题(浅/深/跟随系统)、气泡配色(微信/WhatsApp/iMessage)、
  头像自定义(默认读系统用户头像与应用图标,支持上传)、终端字号;持久化到磁盘
- **微信风格 UI**(设计稿见 `docs/ui-stitch-wechat/`),深色模式全量适配

### 阶段三(体验打磨)
- **结构化渲染**:服务端旁路解析 `git diff` 与纯 JSON 输出;前端提供 diff 增删高亮、JSON 可折叠树,并可随时切回原始输出
- **危险命令双重拦截**:前端命中规则后要求确认;服务端仍会阻断任何未确认请求,覆盖递归删除、磁盘擦除、fork 炸弹、SQL 删除与强制推送等规则
- **消息回放**:会话与 WebSocket 连接解耦,断线后保活 30 分钟;重连按序补发标注事件,刷新页面可重放最近 4MB PTY 原始字节以恢复终端真相层

### 阶段四(安全与多会话)
- **多会话**:会话面板可新建、切换与关闭独立 PTY 会话；断线的会话仍按既有 30 分钟策略保活
- **鉴权**:配置 `LIMINAL_AUTH_TOKEN` 后，API 与 WebSocket 必须携带令牌；桌面版自动使用一次性随机令牌
- **容器隔离**:可显式启用 `LIMINAL_SANDBOX=bwrap`，以用户命名空间隔离会话、禁用网络并限制可写目录

### 阶段五(会话身份与 SSH)
- **会话重命名**:会话面板内可重命名终端(✎)，名称显示在顶栏与会话面板；空名恢复默认
- **窗口标题与终端名**:程序窗口标题固定为 `Liminal`；顶栏显示终端名——本地会话取本机设备名，SSH 会话取目标设备名(解析 `ssh user@host`，支持 `-p` 端口与 `-i`/`-J` 等选项)
- **SSH 一等公民**:会话面板提供「🔗 SSH」新建连接入口，输入 `user@host[:port]` 即建会话并自动执行 ssh；连接历史(user@host、端口、次数)持久化到 `~/.config/liminal/ssh-hosts.json`，新建弹窗内可快捷复用或删除
- **SSH 对话视图操作**:ssh/mosh 不再全屏锁定，直接在对话流中操作——远程提示符(`user@host:~$`)被识别切分成独立的远程命令/输出气泡，密码与指纹确认走气泡内输入组件；顶栏终端名在 SSH 期间切换为目标设备；远程 TUI(如远程 vim)仍会经备用屏检测自动切入终端视图
- **sudo 命令补全**:Tab 补全支持 `sudo`/`env`/`nohup` 等前缀后的命令位识别(`sudo apt<Tab>`、`sudo -u root systemctl<Tab>`)，不再误当文件补全

## 未实现(按路线图)

- 暂无；后续可扩展远程身份提供方、容器镜像策略与跨设备会话持久化
