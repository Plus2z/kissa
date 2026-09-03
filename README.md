<div align="center">

<img src="./desktop/icons/icon-128.png" alt="Kissa Logo" width="100" />

# Kissa (Terminal-Chat)

**将原生终端交互重塑为丝滑优雅的会话流**  
*以真实终端状态为事实来源（Source of Truth），聊天气泡只是增强视图*

[![Version](https://img.shields.io/badge/version-0.2.1-blue.svg?style=flat-square)](./package.json)
[![Platform](https://img.shields.io/badge/platform-Linux%20(AppImage%20%7C%20RPM)-orange.svg?style=flat-square)](https://github.com/)
[![Electron](https://img.shields.io/badge/Electron-33.4.11-47848F.svg?style=flat-square&logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)](./LICENSE)

[功能特性](#-核心特性) • [安装与运行](#-安装与运行) • [架构原理](#-系统架构) • [快捷指令](#-快捷指令与快捷键) • [高级配置](#-高级配置与安全)

</div>

---

## 📖 简介

**Kissa** 是一款创新型的会话式终端工具。它打破了传统终端“连续长文本滚动”的冰冷交互模式，通过旁路状态机与 Shell 集成，将命令输入、输出结果、耗时统计、退出状态及交互输入映射为清晰直观的**对话气泡**。

与纯展示层的终端包装器不同，Kissa 始终坚守**“真实终端为事实来源（Source of Truth）”**的核心设计准则：
- 任何底层 PTY 字节流都原汁原味地在后台事实层运转，绝不篡改、绝不丢失；
- 气泡展示只是非侵入式的“旁路增强”；
- 遇到复杂全屏程序、TUI 视图或未知输出模式时，支持自动/手动无缝切换到经典终端视图，提供 **100% 可靠的硬降级保证**。

---

## ✨ 核心特性

### 💬 终端会话气泡化
- **指令与输出解耦**：命令独立右对齐展示（附带工作目录 cwd 与执行时间戳），输出左对齐呈现。
- **智能折叠与收敛**：超过 30 行的长输出自动折叠中间部分（保留关键首尾 8 行），避免屏幕被海量日志占满；单行进度覆写（`\r` 刷新，如 wget/curl/pip）原地折叠更新。
- **📄 分页器与文档卡片 (Pager Bubble)**：对 `man`、`cat`、`less` 等长篇手册与文档输出，提供独立自适应高度的阅读卡片，内置行号、一键复制、全屏切换以及直观的底部操作栏，支持沉浸式翻阅浏览。
- **结构化输出高亮**：自动识别 `git diff` 增删对比视图与纯 JSON 输出（支持折叠树），并可随时一键切换回原始文本。
- **状态与退出码标识**：运行中实时闪烁指示，成功展示绿色状态，失败高亮非零退出码并精确统计运行耗时。

### 🛡️ 稳固的双层架构 (Truth Layer)
- **常驻真相层**：由 `@xterm/headless` 持续消化全量字节流并维护 4MB 回放缓冲（Replay Buffer）。
- **一键切换终端**：顶栏与右键随时可切入可见终端（xterm.js），键盘输入直连 PTY，支持无缝终端 resize（TIOCSWINSZ）与历史完整重放。

### 🖥️ 全屏与 TUI 程序无缝感知
- **双通道智能识别**：
  - **备用屏幕序列**：自动捕获 `\x1b[?1049h` / `\x1b[?47h`，覆盖 Vim、Nano、Less、Htop 等经典全屏工具；
  - **内联 TUI 名单**：对 Claude Code、Gemini CLI、Antigravity (agy)、Aider、OpenCode 等内联渲染型 AI CLI 工具进行命令级穿透识别；
- **自适应切换**：程序启动自动切换至全屏终端视图，程序退出自动恢复聊天对话，并配备 400ms 抖动吸收与异常退出强制收敛机制。

### ⌨️ 气泡内嵌交互式答题
- 命令行等待用户输入时（如 `sudo` 密码请求、`apt/dnf` 的 `[y/N]` 确认、CLI 文本输入提示等），无需跳出对话流。
- 自动在气泡下方唤起内嵌表单组件：
  - 密码输入框（输入内容遮罩）
  - 确认按钮组（支持回车/点击快速回答）
- 提交后自动转为遮蔽态，防止敏感情报暴露在聊天历史中。

### 🌐 SSH 远程会话一等公民
- **多层嵌套边界识别**：在远程 SSH、Docker 容器或 Sudo 嵌套 Shell 下，利用两级路标机制（OSC 133 + 哨兵 Prompt 注入），自动将远程命令拆分为独立的气泡流。
- **连接管理器**：会话面板提供独立 SSH 连接入口，支持 `user@host[:port]` 快捷创建，历史主机自动保存与一键复用。
- **身份感知**：连接成功后顶栏自动切换为远程主机设备名，断开后自动平滑恢复。

### ⚡ 智能可编程 Tab 补全
- 独立于主会话的后台补全引擎，依据会话工作目录（Cwd）动态调用系统 `bash-completion` 与 `compgen`。
- 智能识别命令位、参数位、文件/目录路径，并穿透 `sudo`、`env`、`nohup` 等前缀。
- 提供可视化的多候选补全弹层，支持 Tab 循环与方向键选择。

### 🔒 安全防御与隔离机制
- **高危命令双重防御**：前后端协同拦截 `rm -rf /`、磁盘格式化、fork 炸弹等破坏性指令，必须用户明确二次确认后方可放行。
- **Bubblewrap 容器沙箱**：支持通过环境变量启用 Linux 用户命名空间轻量隔离，阻断非受信命令的网络访问与关键路径篡改。

### 🎨 丰富视觉与个性化
- **多套经典配色**：支持微信（WeChat）、WhatsApp、iMessage 配色方案与深浅色自适应。
- **高保真 ANSI 颜色**：支持 16 色、256 色及 24 位真彩色（TrueColor）高保真文本渲染。
- **等宽字体定制**：内置 JetBrains Mono、Fira Code、Cascadia Code 等主流开发字体即时切换。
- **历史检索与导出**：支持会话全文检索（`Ctrl+F`）与一键导出整洁的 Markdown 会话记录（`/export`）。

---

## 📦 安装与运行

### 方式 1：下载开箱即用的 Linux 发行包（推荐）

Kissa 在 `desktop/release/` 目录提供了适用于现代 Linux 系统的发行包：

#### 🚀 AppImage（免安装便携版）
适用于所有主流 Linux 发行版（Ubuntu、Debian、Fedora、Arch、Manjaro 等）：
```bash
# 赋予可执行权限并直接运行
chmod +x Kissa-0.2.1.x86_64.AppImage
./Kissa-0.2.1.x86_64.AppImage
```

#### 📦 RPM 安装包（Fedora / Nobara / RHEL / openSUSE）
```bash
sudo dnf install ./Kissa-0.2.1.x86_64.rpm
# 安装后可从系统应用程序菜单直接启动，或在终端输入 kissa 运行
```

---

### 方式 2：从源码构建运行

#### 环境要求
- **Node.js**: >= 18.0.0
- **Python 3**: 系统自带（用于跨平台轻量 PTY 桥接）
- **Bash**: Linux / macOS 默认终端 Shell

#### 1. 安装依赖
```bash
git clone https://github.com/your-username/kissa.git
cd kissa
npm install
```

#### 2. 启动桌面客户端
```bash
npm run desktop
```
> **提示**：桌面端基于 Electron，主进程会在内部随机分配本地安全端口启动 Fastify 核心，完全不依赖外部系统 Node 环境。

#### 3. 启动 Web 版
```bash
# 生产构建并启动（默认访问 http://127.0.0.1:7788）
npm run build
npm start

# 或启动前端热重载开发模式（Vite: 5173 -> 代理后端: 7788）
npm run dev
```

#### 4. 自行打包 RPM 与 AppImage
```bash
# 同时打包 RPM 和 AppImage
npm run dist

# 仅打包 RPM 或 AppImage
npm run dist:rpm
npm run dist:appimage
```
构建产物将保存在 `desktop/release/` 目录下。

---

## 🏛️ 系统架构

Kissa 采用清晰的分层与旁路解耦架构：

```
┌─────────────────────────────────────────────────────────────┐
│                    Kissa Desktop (Electron)                 │
│    主进程管理窗口生命周期，并在随机端口守护拉起轻量服务子进程          │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    Web UI (React 18 + Zustand)              │
│  ┌─────────────────────────────┐  ┌───────────────────────┐ │
│  │   增强展示层 (Bubble Layer)  │  │  事实真相层 (Truth)   │ │
│  │  - 聊天气泡流 (Virtuoso)     │  │  - xterm.js 可视化终端│ │
│  │  - 交互输入框 (InlineInput)  │  │  - 4MB 循环回放缓冲区 │ │
│  │  - 结构化渲染 (Diff / JSON)  │  │  - 常驻无头状态机     │ │
│  └──────────────▲──────────────┘  └───────────▲───────────┘ │
└─────────────────┼─────────────────────────────┼─────────────┘
                  │ 结构化事件 (Events)          │ 原始字节流 (Raw Base64)
┌─────────────────┴─────────────────────────────┴─────────────┐
│                  Kissa Server (Fastify + WS)                │
│  ┌─────────────────────────────┐  ┌───────────────────────┐ │
│  │     OSC 133 流式标注器      │  │      PTY 核心会话     │ │
│  │  - 命令边界解析 (A/B/C/D)    │  │  - Python PTY 桥接    │ │
│  │  - 哨兵注入与 SSH 状态机    │  │  - 会话保活 (30min)   │ │
│  │  - 全屏/TUI 程序自动探测    │  │  - 高危指令拦截引擎   │ │
│  └─────────────────────────────┘  └───────────────────────┘ │
└──────────────────────────────┬──────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │      系统 PTY       │
                    │   /bin/bash / SSH   │
                    └─────────────────────┘
```

---

## ⌨️ 快捷指令与快捷键

### Slash 斜杠指令（直接在输入框键入）
| 指令 | 说明 |
| :--- | :--- |
| `/clear` | 清理当前界面上的所有对话气泡（不影响后台真实 Shell 状态） |
| `/export` | 将当前会话历史一键导出为格式规范的 Markdown 文档 |
| `/ssh` | 打开 SSH 远程连接面板，支持快速连接历史主机 |
| `/help` | 在聊天流中打印帮助说明指南 |

### 常用快捷键
| 快捷键 | 功能说明 |
| :--- | :--- |
| `Enter` | 发送当前输入的命令 / 在多选补全菜单中确认选中的候选项 |
| `Tab` | 触发可编程 Tab 补全（在补全菜单中继续向下遍历候选词） |
| `Shift + Tab` | 在补全候选菜单中向上反向遍历 |
| `↑` / `↓` | 浏览历史命令输入记录 / 挑选补全候选项 |
| `Ctrl + C` | 命令运行中直接向后台 PTY 发送 `\x03` 中断信号 |
| `Ctrl + F` | 唤起全文检索浮层，高亮匹配的历史命令与终端输出 |
| `Esc` | 关闭补全浮层或关闭模态窗口 |

---

## ⚙️ 高级配置与安全

### 1. 访问令牌鉴权 (Auth Token)
若将 Web 版本部署在远程局域网或服务器上，强烈建议配置安全令牌：
```bash
# 启动时注入自定义访问令牌
KISSA_AUTH_TOKEN='YourSecureRandomToken' npm start
```
此时 Web 端访问地址需携带令牌：`http://ip:7788/?token=YourSecureRandomToken`，未授权访问将被阻断。

### 2. Bubblewrap 隔离沙箱 (Sandbox)
在 Linux 环境下，可以通过 `bwrap` 启用轻量进程沙箱：
```bash
KISSA_SANDBOX=bwrap KISSA_WORKSPACE="$PWD" npm start
```
该模式会隔离网络连接，将宿主文件系统设为只读，仅允许会话在指定的 `$PWD` 及临时目录内操作。

---

## 🛠️ 技术栈

- **桌面外壳**：[Electron 33](https://www.electronjs.org/)
- **前端视图**：[React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Tailwind CSS](https://tailwindcss.com/)
- **状态管理**：[Zustand](https://github.com/pmndrs/zustand)
- **虚拟滚动**：[React Virtuoso](https://virtuoso.dev/)
- **终端仿真**：[@xterm/xterm](https://xtermjs.org/) + [@xterm/headless](https://xtermjs.org/) + [@xterm/addon-fit](https://xtermjs.org/)
- **服务端**：[Fastify 5](https://fastify.dev/) + [@fastify/websocket](https://github.com/fastify/fastify-websocket)
- **PTY 桥接**：Python 3 原生 `pty` + `termios` 桥接层

---

## 🤝 参与贡献

欢迎提交 Issue 与 Pull Request！

```bash
# 运行单元与端到端测试套件
npm run test:ssh   # 运行 SSH 与嵌套 Shell 状态机测试
npm run test:ws    # 运行 WebSocket 管道端到端测试
```

---

## 📄 开源许可

本项目基于 [MIT License](./LICENSE) 开源发布。
