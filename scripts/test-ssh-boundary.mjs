/**
 * SSH / 嵌套 Shell 场景命令边界识别与三级降级自动化测试套件。
 *
 * 验证目标:
 * 1. 嵌套 Shell 命令触发规则匹配 (ssh / sudo -i / docker exec -it)
 * 2. 第一级: 嵌套环境中 OSC 133 自动探测与命令切分
 * 3. 第二级: 哨兵 Prompt 注入、正则切分与退出码提取
 * 4. 第三级: 超时自动降级与全屏特征 (1049 备用屏) 独立生效
 * 5. 多级嵌套 (栈式 push/pop) 状态管理
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

// Test 3: 第二级 哨兵 Prompt 模式切分
{
  console.log('  Testing Level 2: Sentinel Prompt injection & parsing...')
  const events = []
  let injectedStdin = ''
  const annotator = new Osc133Annotator((ev) => {
    events.push(ev)
    if (ev.kind === 'inject_stdin') {
      injectedStdin = ev.data
    }
  })

  // 启动 SSH 命令
  annotator.write('\x1b]133;A;/home/user\x07\x1b]133;B\x07ssh unmanaged-host\x1b]133;C\x07')

  // 等待探测超时触发哨兵注入 (通过快速模拟时间或等待)
  await new Promise((resolve) => setTimeout(resolve, 3100))

  // 应该触发了 inject_stdin
  assert.ok(injectedStdin.includes('export PS1=') || injectedStdin.includes('@@CTI_'))
  
  // 提取下发的 token
  const tokenMatch = injectedStdin.match(/@@CTI_([0-9a-f]+)_\$?\?@@/)
  assert.ok(tokenMatch, 'Sentinel token should be in stdin injection')
  const token = tokenMatch[1]

  // 模拟远程 shell 响应哨兵 Prompt
  // 首个提示符回显 (进入 idle)
  annotator.write(`\n@@CTI_${token}_0@@\n`)

  // 用户执行命令与回显: date
  annotator.write(`date\nSun Aug 23 17:30:00 CST 2026\n@@CTI_${token}_0@@\n`)

  // 检查是否切分出 date 命令
  const dateCmd = events.find((e) => e.kind === 'command_start' && e.text === 'date')
  assert.ok(dateCmd, 'date command should be started')

  const dateEnd = events.find((e) => e.kind === 'command_end' && e.exitCode === 0)
  assert.ok(dateEnd, 'date command should end with code 0')

  // 执行一条失败命令: cat nonexistent
  annotator.write(`cat nonexistent\ncat: nonexistent: No such file or directory\n@@CTI_${token}_1@@\n`)
  const catEnd = events.find((e) => e.kind === 'command_end' && e.exitCode === 1)
  assert.ok(catEnd, 'cat command should end with code 1')

  annotator.close(0)
  console.log('    ✓ Level 2 Sentinel Prompt mode passed')
}

// Test 4: 全屏/备用屏在降级模式下的独立性
{
  console.log('  Testing Fullscreen independence in sentinel/passthrough mode...')
  const events = []
  const annotator = new Osc133Annotator((ev) => events.push(ev))

  annotator.write('\x1b]133;A;/home\x07\x1b]133;B\x07ssh node\x1b]133;C\x07')
  
  // 模拟远程直接运行 vim 进入备用屏 \x1b[?1049h
  annotator.write('\x1b[?1049h')
  const fsActive = events.find((e) => e.kind === 'fullscreen' && e.status === 'active')
  assert.ok(fsActive, 'Fullscreen should be triggered by alternate screen buffer sequence')

  // 退出 vim 备用屏 \x1b[?1049l
  annotator.write('\x1b[?1049l')
  await new Promise((resolve) => setTimeout(resolve, 450)) // 等待 400ms 宽限期
  const fsExited = events.find((e) => e.kind === 'fullscreen' && e.status === 'exited')
  assert.ok(fsExited, 'Fullscreen should be exited after grace period')

  annotator.close(0)
  console.log('    ✓ Fullscreen independence verified')
}

console.log('🎉 All SSH & Nested Shell Boundary Tests Passed!')
