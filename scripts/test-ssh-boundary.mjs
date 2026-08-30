/**
 * SSH / 嵌套 Shell 场景命令边界识别与三级降级自动化测试套件。
 *
 * 验证目标:
 * 1. 嵌套 Shell 命令触发规则匹配 (ssh / sudo -i / docker exec -it)
 * 2. 第一级: 嵌套环境中 OSC 133 自动探测与命令切分
 * 3. 第二级: 提示符就绪即时触发哨兵注入与全屏状态收敛
 * 4. 第三级: 密码认证提示与登录成功后 input_request_end 即时清理
 * 5. 全屏程序 (如在远程环境中运行 vim) 独立进出
 */

import assert from 'node:assert/strict'
import { Osc133Annotator } from '../server/dist/osc133.js'
import { parseNestedShellCommand } from '../server/dist/nestedShell.js'

console.log('🧪 Starting SSH & Nested Shell Boundary Tests...')

// Test 1: 嵌套 Shell 触发规则
{
  console.log('  Testing nested shell command parsing...')
  const ssh = parseNestedShellCommand('ssh -p 2222 user@remote-host')
  assert.ok(ssh && ssh.type === 'ssh' && ssh.targetName === 'user@remote-host')

  const sudo = parseNestedShellCommand('sudo -i')
  assert.ok(sudo && sudo.type === 'sudo')

  const docker = parseNestedShellCommand('docker exec -it my-container bash')
  assert.ok(docker && docker.type === 'docker' && docker.targetName === 'docker:my-container')

  const normal = parseNestedShellCommand('ls -la /tmp')
  assert.equal(normal, null)
  console.log('    ✓ Nested command parsing passed')
}

// Test 2: 第一级 OSC 133 命中
{
  console.log('  Testing Level 1: OSC 133 Shell Integration in nested shell...')
  const events = []
  const annotator = new Osc133Annotator((ev) => events.push(ev))

  // 1. 发起 SSH 命令
  annotator.write('\x1b]133;A;/home/user\x07\x1b]133;B\x07ssh root@remote-node\x1b]133;C\x07')
  
  // 此时处于 probing 模式
  const probingEv = events.find((e) => e.kind === 'boundary_mode')
  assert.ok(probingEv)
  assert.equal(probingEv.depth, 1)

  // 2. 远程 shell 输出 OSC 133 (表示支持第一级)
  annotator.write('\x1b]133;A;/root\x07\x1b]133;B\x07uname -a\x1b]133;C\x07Linux remote-node 6.1.0\n\x1b]133;D;0\x07')

  // 验证模式升级为 osc133 并且产出了远程命令事件
  const osc133Modes = events.filter((e) => e.kind === 'boundary_mode' && e.mode === 'osc133')
  assert.ok(osc133Modes.length > 0)

  const cmdStarts = events.filter((e) => e.kind === 'command_start')
  assert.ok(cmdStarts.some((c) => c.text === 'uname -a'))

  const cmdEnds = events.filter((e) => e.kind === 'command_end')
  assert.ok(cmdEnds.some((c) => c.exitCode === 0))

  annotator.close(0)
  console.log('    ✓ Level 1 OSC 133 integration passed')
}

// Test 3: 第二级 提示符识别即时触发哨兵注入与全屏收敛
{
  console.log('  Testing Level 2: Prompt detection triggers sentinel injection & clears fullscreen...')
  const events = []
  let injectedStdin = ''
  const annotator = new Osc133Annotator((ev) => {
    events.push(ev)
    if (ev.kind === 'inject_stdin') {
      injectedStdin = ev.data
    }
  })

  // 启动 SSH 命令, 远程连接时先发了一个备用屏序列 (模拟某些系统的登录初始化)
  annotator.write('\x1b]133;A;/home/user\x07\x1b]133;B\x07ssh unmanaged-host\x1b]133;C\x07\x1b[?1049h')

  // 远程输出登录横幅和提示符: user@server:~$
  annotator.write('Welcome to server\r\nuser@unmanaged-host:~$ ')

  // 应该立即触发了哨兵注入 (无需等待超时)
  assert.ok(injectedStdin.includes('export PS1=') || injectedStdin.includes('@@CTI_'))
  
  const tokenMatch = injectedStdin.match(/@@CTI_([0-9a-f]+)_\$?\?@@/)
  assert.ok(tokenMatch, 'Sentinel token should be in stdin injection')
  const token = tokenMatch[1]

  // 模拟远程 shell 响应哨兵 Prompt (并确认全屏已被强制收敛)
  annotator.write(`\n@@CTI_${token}_0@@\n`)

  const fsExited = events.filter((e) => e.kind === 'fullscreen' && e.status === 'exited')
  assert.ok(fsExited.length > 0, 'Fullscreen must be exited once shell prompt is ready')

  // 用户执行命令与回显: date
  annotator.write(`date\nSun Aug 23 17:30:00 CST 2026\n@@CTI_${token}_0@@\n`)

  const dateCmd = events.find((e) => e.kind === 'command_start' && e.text === 'date')
  assert.ok(dateCmd, 'date command should be started')

  const dateEnd = events.find((e) => e.kind === 'command_end' && e.exitCode === 0)
  assert.ok(dateEnd, 'date command should end with code 0')

  annotator.close(0)
  console.log('    ✓ Prompt detection & fullscreen convergence passed')
}

// Test 4: 密码认证与登录成功后 input_request 清理
{
  console.log('  Testing Password prompt detection and immediate cleanup upon login...')
  const events = []
  let injectedStdin = ''
  const annotator = new Osc133Annotator((ev) => {
    events.push(ev)
    if (ev.kind === 'inject_stdin') {
      injectedStdin = ev.data
    }
  })

  // 1. 发起 SSH
  annotator.write('\x1b]133;A;/home\x07\x1b]133;B\x07ssh root@192.168.0.105\x1b]133;C\x07')
  
  // 2. 远程要求密码
  annotator.write("root@192.168.0.105's password: ")
  await new Promise((resolve) => setTimeout(resolve, 900)) // 等待 tick() 触发 input_request

  const req = events.find((e) => e.kind === 'input_request' && e.mode === 'password')
  assert.ok(req, 'Password input_request should be triggered')

  // 此时绝不能下发哨兵注入！
  assert.equal(injectedStdin, '', 'Must NOT inject sentinel while awaiting password!')

  // 3. 用户输入密码后登录成功，远程返回 banner 和提示符
  annotator.write("\r\nLinux Melange 6.17.2-1-pve\r\nLast login: Sun Aug 23 18:44:41\r\nroot@Melange:~# ")

  // 4. 验证 input_request_end 被发出，且哨兵注入被触发
  const reqEnd = events.find((e) => e.kind === 'input_request_end')
  assert.ok(reqEnd, 'input_request_end must be emitted as soon as login succeeds')

  assert.ok(injectedStdin.includes('export PS1='), 'Sentinel injection should be triggered after prompt appears')

  // 5. 哨兵生效并执行 ls /
  const tokenMatch = injectedStdin.match(/@@CTI_([0-9a-f]+)_\$?\?@@/)
  const token = tokenMatch[1]
  annotator.write(`\n@@CTI_${token}_0@@\n`)

  // 用户执行 ls /
  annotator.write(`ls /\nbin  boot  dev  etc  home  lib\n@@CTI_${token}_0@@\n`)

  const lsCmd = events.find((e) => e.kind === 'command_start' && e.text === 'ls /')
  assert.ok(lsCmd, 'ls / should start as an independent command')

  const lsEnd = events.find((e) => e.kind === 'command_end' && e.commandId === lsCmd.commandId)
  assert.ok(lsEnd, 'ls / should end properly')

  annotator.close(0)
  console.log('    ✓ Password prompt flow & input_request cleanup verified')
}

// Test 5: 全屏/备用屏在降级模式下的独立性 (在远程真正跑 vim 时仍可切全屏)
{
  console.log('  Testing Fullscreen independence in sentinel mode (vim invocation)...')
  const events = []
  const annotator = new Osc133Annotator((ev) => events.push(ev))

  annotator.write('\x1b]133;A;/home\x07\x1b]133;B\x07ssh node\x1b]133;C\x07')
  
  // 模拟远程真正运行 vim 进入备用屏 \x1b[?1049h
  annotator.write('vim test.txt\r\n\x1b[?1049h')
  const fsActive = events.find((e) => e.kind === 'fullscreen' && e.status === 'active')
  assert.ok(fsActive, 'Fullscreen should be triggered by vim alternate screen buffer sequence')

  // 退出 vim 备用屏 \x1b[?1049l
  annotator.write('\x1b[?1049l')
  await new Promise((resolve) => setTimeout(resolve, 450))
  const fsExited = events.find((e) => e.kind === 'fullscreen' && e.status === 'exited')
  assert.ok(fsExited, 'Fullscreen should be exited after grace period')

  annotator.close(0)
  console.log('    ✓ Fullscreen independence for TUI verified')
}

// Test 6: stripAnsi 字符集序列过滤与中文交互提示符匹配
{
  console.log('  Testing stripAnsi charset escapes and Chinese interactive prompts...')
  const { stripAnsi } = await import('../server/dist/osc133.js')

  // 1. stripAnsi 过滤 \x1b(B / \x1b)0 等字符集控制字符
  const rawWithCharset = '\x1b(B\x1b[0m\x1b[32mhello world\x1b(B'
  assert.strictEqual(stripAnsi(rawWithCharset), 'hello world', 'stripAnsi must clean \\x1b(B charset sequences')

  // 2. 中文冒号与问号 prompt 探测
  const events = []
  const annotator = new Osc133Annotator((ev) => events.push(ev))
  annotator.write('\x1b]133;A;/home\x07\x1b]133;B\x07python install.py\x1b]133;C\x07')
  annotator.write('请输入目标端口：')
  await new Promise((resolve) => setTimeout(resolve, 800))

  const promptReq = events.find((e) => e.kind === 'input_request' && e.mode === 'text')
  assert.ok(promptReq, 'Chinese full-width colon prompt must trigger input_request')
  assert.ok(promptReq.prompt.includes('请输入目标端口：'))

  annotator.close(0)
  console.log('    ✓ stripAnsi charset cleanup and Chinese prompt detection passed')
}

console.log('🎉 All SSH & Nested Shell Boundary Tests Passed!')
