<div align="center">

<img src="./desktop/icons/icon-128.png" alt="Kissa Logo" width="100" />

# Kissa (Terminal-Chat)

**Transforming native terminal interactions into an elegant, conversational stream.**  
*The real terminal state is the single source of truth; chat bubbles are just an enhanced view.*

[![Version](https://img.shields.io/badge/version-0.2.1-blue.svg?style=flat-square)](./package.json)
[![Platform](https://img.shields.io/badge/platform-Linux%20(AppImage%20%7C%20RPM)-orange.svg?style=flat-square)](https://github.com/)
[![Electron](https://img.shields.io/badge/Electron-33.4.11-47848F.svg?style=flat-square&logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)](./LICENSE)

**English** | [简体中文](./README.md)

[Features](#-key-features) • [Installation & Usage](#-installation--usage) • [Architecture](#-architecture) • [Shortcuts](#-shortcuts--slash-commands) • [Configuration](#-advanced-configuration--security)

</div>

---

## 📖 Introduction

**Kissa (喫茶)** draws its name from the Japanese word for "tea-drinking" or a cozy café (*kissaten*). The idea was born from an imagery of calm, orderly conversation—interacting with a terminal should feel as unhurried and delightful as sipping coffee in an afternoon tearoom. It was never built to be a rigid, world-disrupting "productivity behemoth." Built purely **just for fun**, Kissa reimagines the cold, monochrome scrolling waterfall into a charming, aesthetic tea chat between human and machine.

### Core Highlights

- **Bubble-Based Conversational Flow**: Say goodbye to cluttered, infinite walls of scrolling text. Deeply integrated with your shell via an out-of-band state machine, commands, outputs, duration metrics, and exit codes are reconstructed into clean, self-contained dialogue bubbles—every press of Enter feels as natural as sending a message.
- **The Real Terminal as Single Source of Truth**: Unlike superficial UI wrappers, Kissa's underlying PTY byte stream runs uninhibited in the background—never tampering with, swallowing, or dropping data. The bubbles are merely a harmless, non-intrusive sideband enhancement; whenever complex full-screen applications or unfamiliar output patterns are encountered, Kissa seamlessly falls back to a standard terminal view with a 100% reliable hard fallback guarantee.

---

## ✨ Key Features

### 💬 Conversational Bubbles
- **Decoupled Commands & Outputs**: Commands are right-aligned with current working directory (Cwd) and execution timestamps; outputs are neatly left-aligned.
- **Smart Folding & Compression**: Outputs exceeding 30 lines are automatically folded in the middle (preserving the first 8 and last 8 lines) to prevent screen flooding. Single-line progress overwrites (`\r` refreshes from tools like `curl`, `wget`, or `pip`) are collapsed in place.
- **📄 Pager Bubble (Document Cards)**: Long outputs from tools like `man`, `cat`, and `less` are rendered as responsive reading cards with line numbers, copy actions, full-screen toggle, and native pager navigation keys (`b`, `Space`, `/`, `q`).
- **Structured Rendering**: Automatically recognizes `git diff` with unified syntax-highlighted additions/deletions and pure JSON formatted as interactive collapsible trees, with instant toggling back to raw text.
- **Status & Exit Codes**: Live pulsating indicators during execution, green success badges, and clear red indicators for non-zero exit codes with millisecond-precision timing.

### 🛡️ Resilient Dual-Layer Architecture (Truth Layer)
- **Persistent Headless Terminal**: Powered by `@xterm/headless` continuously parsing the full byte stream and maintaining a 4MB rolling replay buffer.
- **Instant Terminal Fallback**: Switch to a fully functional xterm.js view at any time from the top bar or context menu, featuring direct PTY keyboard interaction, dynamic window resizing (TIOCSWINSZ), and complete historical replay.

### 🖥️ Full-Screen & TUI Program Awareness
- **Dual-Channel Detection**:
  - **Alternate Screen Buffer Detection**: Catches `\x1b[?1049h` / `\x1b[?47h` sequences for classic tools like Vim, Nano, Less, and Htop.
  - **Inline TUI Registry**: Command-level detection for modern inline AI CLI tools (such as Claude Code, Gemini CLI, Antigravity/agy, Aider, OpenCode, etc.).
- **Smooth Auto-Switching**: Automatically transitions to the full-screen terminal on launch and smoothly restores the chat stream upon exit, equipped with a 400ms jitter debounce and crash convergence safeguards.

### ⌨️ In-Bubble Interactive Prompts
- Prompts requiring user input (such as `sudo` password requests, `[y/N]` confirmations, or text inputs) are handled directly within the bubble stream without switching views.
- Embedded input components include:
  - Masked password input fields.
  - Quick-action confirmation buttons (Yes / No).
- Completed inputs transition into an obscured state to prevent sensitive credentials from lingering in conversation history.

### 🌐 First-Class SSH & Nested Shells
- **Multi-Tier Boundary Recognition**: In remote SSH, Docker containers, or `sudo` nested shells, a two-level landmark mechanism (OSC 133 + Sentinel Prompt Injection) reliably breaks down remote sessions into distinct command bubbles.
- **Connection Manager**: Dedicated SSH connection modal supporting `user@host[:port]`, complete with persistent history and quick reconnects.
- **Device Identity**: Automatically reflects the remote hostname in the top bar while connected, returning seamlessly to the local machine identity upon disconnect.

### ⚡ Programmable Tab Completion
- Out-of-band completion engine dynamically invoking system `bash-completion` and `compgen` in the session's active directory without polluting session history.
- Distinguishes commands, options, and file/directory paths while transparently piercing prefixes like `sudo`, `env`, and `nohup`.
- Visual completion popup menu supporting Tab cycling, directional navigation, and Enter-to-apply.

### 🔒 Safety & Sandboxing
- **Dual-Layer Dangerous Command Interception**: Client and server cooperate to trap destructive commands (e.g., `rm -rf /`, disk formatting, fork bombs), requiring explicit confirmation before execution.
- **Bubblewrap Container Isolation**: Optional Linux user-namespace sandboxing via `bwrap` to disable network access and restrict filesystem modifications to designated directories.

### 🎨 Customization & Aesthetics
- **Theme Palettes**: Clean WeChat, WhatsApp, and iMessage inspired bubble styles with adaptive Light and Dark modes.
- **TrueColor ANSI Fidelity**: Full support for 16-color, 256-color, and 24-bit TrueColor output.
- **Typography**: On-the-fly switching between popular developer monospaced fonts (JetBrains Mono, Fira Code, Cascadia Code, etc.).
- **Search & Export**: Full-text conversational search (`Ctrl+F`) and one-click export to structured Markdown logs (`/export`).

---

## 📦 Installation & Usage

### Method 1: Ready-to-Use Linux Packages (Recommended)

Pre-built binaries are available under `desktop/release/`:

#### 🚀 AppImage (Portable, Universal Linux)
Works on virtually any modern Linux distribution (Ubuntu, Debian, Fedora, Arch, Manjaro, etc.):
```bash
chmod +x Kissa-0.2.1.x86_64.AppImage
./Kissa-0.2.1.x86_64.AppImage
```

#### 📦 RPM Package (Fedora / Nobara / RHEL / openSUSE)
```bash
sudo dnf install ./Kissa-0.2.1.x86_64.rpm
# Launch directly from your application launcher or run `kissa` from the terminal
```

---

### Method 2: Building from Source

#### Prerequisites
- **Node.js**: >= 18.0.0
- **Python 3**: Pre-installed on most systems (used for the lightweight PTY bridge)
- **Bash**: Default system shell

#### 1. Clone and Install Dependencies
```bash
git clone https://github.com/Plus2z/kissa.git
cd kissa
npm install
```

#### 2. Start Desktop Client
```bash
npm run desktop
```
> **Note**: The desktop shell runs on Electron. The main process spawns Fastify on a randomized local port and does not require a system-wide Node.js installation once packaged.

#### 3. Start Web Version
```bash
# Production build and serve (default at http://127.0.0.1:7788)
npm run build
npm start

# Or start with Vite hot-reload development mode
npm run dev
```

#### 4. Packaging RPM & AppImage
```bash
# Package both RPM and AppImage
npm run dist

# Package individual targets
npm run dist:rpm
npm run dist:appimage
```
Artifacts will be placed in the `desktop/release/` directory.

---

## 🏛️ Architecture

Kissa implements a decoupled, sideband streaming architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    Kissa Desktop (Electron)                 │
│      Main process manages window lifecycle and spawns       │
│           a secure local daemon on a dynamic port           │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    Web UI (React 18 + Zustand)              │
│  ┌─────────────────────────────┐  ┌───────────────────────┐ │
│  │     Enhanced Bubble Layer   │  │   Truth Layer (Core)  │ │
│  │  - Virtualized Chat Stream  │  │  - xterm.js Visualizer│ │
│  │  - Inline Prompt Forms      │  │  - 4MB Rolling Buffer │ │
│  │  - Structured Views (Diff)  │  │  - Headless State Mach│ │
│  └──────────────▲──────────────┘  └───────────▲───────────┘ │
└─────────────────┼─────────────────────────────┼─────────────┘
                  │ Structured Events            │ Raw Stream (Base64)
┌─────────────────┴─────────────────────────────┴─────────────┐
│                  Kissa Server (Fastify + WS)                │
│  ┌─────────────────────────────┐  ┌───────────────────────┐ │
│  │     OSC 133 Streaming Parse │  │      PTY Sessions     │ │
│  │  - Command Boundary (A/B/C) │  │  - Python PTY Bridge  │ │
│  │  - Sentinel SSH Engine      │  │  - Keep-Alive (30min) │ │
│  │  - Fullscreen TUI Detection │  │  - Danger Rule Guard  │ │
│  └─────────────────────────────┘  └───────────────────────┘ │
└──────────────────────────────┬──────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │      System PTY     │
                    │   /bin/bash / SSH   │
                    └─────────────────────┘
```

---

## ⌨️ Shortcuts & Slash Commands

### Slash Commands (Type in input bar)
| Command | Description |
| :--- | :--- |
| `/clear` | Clears all current chat bubbles (underlying shell state remains intact) |
| `/export` | Exports the full conversation history to a clean Markdown document |
| `/ssh` | Opens the SSH connection modal for quick host management |
| `/help` | Prints the interactive guide card in the stream |

### Keyboard Shortcuts
| Shortcut | Action |
| :--- | :--- |
| `Enter` | Submits command / Applies highlighted completion candidate |
| `Tab` | Triggers programmable completion / Cycles through candidates |
| `Shift + Tab` | Cycles backwards through completion candidates |
| `↑` / `↓` | Navigates command history / Highlights completion items |
| `Ctrl + C` | Sends `\x03` interrupt signal to running foreground processes |
| `Ctrl + F` | Toggles full-text search bar with result navigation |
| `Esc` | Closes completion menu or active modal |

---

## ⚙️ Advanced Configuration & Security

### 1. Authentication Token
When deploying the Web version on a local network or remote server, setting an authentication token is strongly recommended:
```bash
KISSA_AUTH_TOKEN='YourSecureRandomToken' npm start
```
Access the client with the token query parameter: `http://<ip>:7788/?token=YourSecureRandomToken`. Unauthorized requests will be rejected.

### 2. Bubblewrap Sandbox
On Linux systems with `bwrap` installed, enable lightweight user-namespace isolation:
```bash
KISSA_SANDBOX=bwrap KISSA_WORKSPACE="$PWD" npm start
```
This isolates network access, mounts the host root as read-only, and restricts write operations strictly to the designated workspace and session temporary directory.

---

## 🛠️ Tech Stack

- **Desktop Shell**: [Electron 33](https://www.electronjs.org/)
- **Frontend**: [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Tailwind CSS](https://tailwindcss.com/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Virtualization**: [React Virtuoso](https://virtuoso.dev/)
- **Terminal Core**: [@xterm/xterm](https://xtermjs.org/) + [@xterm/headless](https://xtermjs.org/) + [@xterm/addon-fit](https://xtermjs.org/)
- **Backend Service**: [Fastify 5](https://fastify.dev/) + [@fastify/websocket](https://github.com/fastify/fastify-websocket)
- **PTY Bridge**: Python 3 Native `pty` + `termios` layer

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

```bash
# Run test suites
npm run test:ssh   # Test SSH and nested shell state machine
npm run test:ws    # Test WebSocket protocol end-to-end
```

---

## 📄 License

This project is licensed under the [MIT License](./LICENSE).
