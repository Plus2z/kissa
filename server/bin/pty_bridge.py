#!/usr/bin/env python3
"""Kissa PTY 桥。

给 Node 服务提供无原生编译依赖的 PTY 能力(替代 node-pty,语义对齐):

  stdin  → PTY master 输入(用户键入,二进制)
  stdout ← PTY master 输出(原始字节,二进制)
  stderr ← 生命周期事件(JSON 行:{"exit": N})
  fd 3   ← 控制通道(JSON 行:{"cols": C, "rows": R} → TIOCSWINSZ)

用法: pty_bridge.py <shell> [args...]
环境变量: TC_COLS / TC_ROWS(初始窗口大小)、TC_CWD(初始目录)
"""

import fcntl
import json
import os
import pty
import signal
import struct
import sys
import termios
import threading


def set_winsize(fd: int, rows: int, cols: int) -> None:
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))


def main() -> None:
    argv = sys.argv[1:]
    if not argv:
        print("usage: pty_bridge.py <shell> [args...]", file=sys.stderr)
        sys.exit(2)

    cols = int(os.environ.get("TC_COLS", "80"))
    rows = int(os.environ.get("TC_ROWS", "24"))
    cwd = os.environ.get("TC_CWD") or None

    pid, master = pty.fork()
    if pid == 0:
        if cwd:
            try:
                os.chdir(cwd)
            except OSError:
                pass
        os.environ["TERM"] = "xterm-256color"
        os.execv(argv[0], argv)
        os._exit(127)

    set_winsize(master, rows, cols)

    def on_term(_signum, _frame):
        try:
            os.killpg(os.getpgid(pid), signal.SIGTERM)
        except OSError:
            pass
        os._exit(0)

    signal.signal(signal.SIGTERM, on_term)
    signal.signal(signal.SIGINT, on_term)

    def pump_stdin():
        """stdin(Node)→ PTY master。stdin 关闭意味着连接断开,收掉 shell。"""
        try:
            while True:
                data = sys.stdin.buffer.read1(65536)
                if not data:
                    break
                os.write(master, data)
        except OSError:
            pass
        try:
            os.killpg(os.getpgid(pid), signal.SIGHUP)
        except OSError:
            pass

    def pump_control():
        """fd 3 控制通道:resize 等。"""
        try:
            with os.fdopen(3, "r") as f:
                for line in f:
                    try:
                        msg = json.loads(line)
                    except ValueError:
                        continue
                    if "cols" in msg and "rows" in msg:
                        try:
                            set_winsize(master, int(msg["rows"]), int(msg["cols"]))
                        except OSError:
                            pass
        except OSError:
            pass

    threading.Thread(target=pump_stdin, daemon=True).start()
    threading.Thread(target=pump_control, daemon=True).start()

    out = sys.stdout.buffer
    try:
        while True:
            try:
                data = os.read(master, 65536)
            except OSError:
                break
            if not data:
                break
            out.write(data)
            out.flush()
    finally:
        try:
            _, status = os.waitpid(pid, 0)
            code = os.waitstatus_to_exitcode(status)
        except (ChildProcessError, OSError):
            code = -1
        try:
            sys.stderr.write(json.dumps({"exit": code}) + "\n")
            sys.stderr.flush()
        except OSError:
            pass
        os.close(master)
        os._exit(0)


if __name__ == "__main__":
    main()
