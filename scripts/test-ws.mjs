/**
 * WS 协议端到端测试:直接连本地服务,验证真相层与标注层。
 *
 * 用法:先启动服务(npm run dev -w server),再 node scripts/test-ws.mjs
 */

import WebSocket from 'ws'
import { parseSshTarget } from '../server/dist/ssh.js'
import { Osc133Annotator } from '../server/dist/osc133.js'

const URL = process.env.WS_URL ?? 'ws://127.0.0.1:7788/ws'
const AUTH_TOKEN = process.env.LIMINAL_AUTH_TOKEN ?? ''
const WS_OPTIONS = AUTH_TOKEN ? { headers: { 'x-liminal-token': AUTH_TOKEN } } : undefined
const API_BASE = (process.env.API_URL ?? URL).replace(/^ws/, 'http').replace(/\/ws(?:\?.*)?$/, '')
const ws = new WebSocket(URL, WS_OPTIONS)
ws.binaryType = 'nodebuffer'

const events = []
let rawTotal = 0
let mySessionId = null

const results = []
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail })
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`)
}

function commandEnd(commandId) {
  return events.find((e) => e.type === 'command_end' && e.commandId === commandId)
}
function starts() {
  return events.filter((e) => e.type === 'command_start')
}
function outputOf(commandId) {
  const ev = events.filter((e) => e.type === 'output' && e.commandId === commandId).pop()
  return ev ? ev.content : ''
}

function send(msg) {
  ws.send(JSON.stringify(msg))
}

function waitFor(pred, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const t = setInterval(() => {
      if (pred()) {
        clearInterval(t)
        clearTimeout(timer)
        resolve()
      }
    }, 30)
    const timer = setTimeout(() => {
      clearInterval(t)
      reject(new Error('timeout waiting for condition'))
    }, timeoutMs)
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(path, init = {}) {
  const headers = new Headers(init.headers)
  if (AUTH_TOKEN) headers.set('x-liminal-token', AUTH_TOKEN)
  return fetch(`${API_BASE}${path}`, { ...init, headers })
}

function unauthenticatedWsStatus() {
  return new Promise((resolve) => {
    const candidate = new WebSocket(URL)
    candidate.once('unexpected-response', (_request, response) => {
      candidate.terminate()
      resolve(response.statusCode ?? 0)
    })
    candidate.once('error', () => resolve(0))
  })
}

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString('utf8'))
  if (msg.type === 'ready') mySessionId = msg.sessionId
  if (msg.type === 'raw') {
    rawTotal += Buffer.from(msg.data, 'base64').length
  } else {
    events.push(msg)
  }
})

ws.on('open', async () => {
  try {
    // 新连接先 attach(无历史会话 → 服务端新建)
    ws.send(JSON.stringify({ type: 'attach', sessionId: null, lastSeq: 0, wantRaw: false }))
    await waitFor(() => events.some((e) => e.type === 'ready'))
    const ready = events.find((e) => e.type === 'ready')
    check('ready 携带主机名', typeof ready.hostname === 'string' && ready.hostname.length > 0,
      JSON.stringify(ready.hostname))

    // 阶段四:认证与多会话 REST 接口
    if (AUTH_TOKEN) {
      const unauthenticated = await fetch(`${API_BASE}/api/sessions`)
      check('未带令牌的会话接口返回 401', unauthenticated.status === 401, String(unauthenticated.status))
      const wsStatus = await unauthenticatedWsStatus()
      check('未带令牌的 WebSocket 握手返回 401', wsStatus === 401, String(wsStatus))
    }
    const listed = await api('/api/sessions')
    const initialSessions = await listed.json()
    check('当前 WS 会话出现在会话列表', initialSessions.some((s) => s.id === mySessionId))
    const created = await api('/api/sessions', { method: 'POST' })
    const extraSession = await created.json()
    check('可创建独立后台会话', created.status === 201 && extraSession.id !== mySessionId)
    const removed = await api(`/api/sessions/${extraSession.id}`, { method: 'DELETE' })
    check('可关闭独立后台会话', removed.status === 204, String(removed.status))

    // 阶段B:会话重命名(终端名)→ summary 反映
    send({ type: 'rename', sessionId: mySessionId, name: '我的工作台' })
    await sleep(250)
    const listedR = await (await api('/api/sessions')).json()
    const mine = listedR.find((s) => s.id === mySessionId)
    check('会话重命名生效(summary.name)', mine?.name === '我的工作台', JSON.stringify(mine?.name))

    // 阶段B:SSH 目标解析(纯函数单元断言)
    check('SSH 解析:user@host', parseSshTarget('ssh howard@myserver')?.host === 'myserver' && parseSshTarget('ssh howard@myserver')?.user === 'howard', '')
    check('SSH 解析:-p 端口与选项跳过', parseSshTarget('ssh -p 2222 -i key.pem root@host')?.port === 2222 && parseSshTarget('ssh -p 2222 -i key.pem root@host')?.host === 'host', '')
    check('SSH 解析:非 ssh 命令返回 null', parseSshTarget('ls -la') === null, '')
    check('SSH 解析:远程命令不干扰目标', parseSshTarget('ssh user@host ls -la')?.host === 'host', '')

    // 阶段C:SSH 历史 API(记录/列表/删除)
    const rec = await api('/api/ssh-hosts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: 'howard', host: 'myserver', port: 22 }),
    })
    const hostsRec = await rec.json()
    check('SSH 历史:记录成功', hostsRec.some((h) => h.host === 'myserver' && h.user === 'howard'), '')
    const hostsList = await (await api('/api/ssh-hosts')).json()
    check('SSH 历史:列表可查', hostsList.some((h) => h.host === 'myserver'), '')
    const del = await api('/api/ssh-hosts', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: 'howard', host: 'myserver', port: 22 }),
    })
    const hostsDel = await del.json()
    check('SSH 历史:删除成功', !hostsDel.some((h) => h.host === 'myserver'), '')

    // 阶段C:创建 SSH 会话(服务端解析目标 + 自动执行 ssh),随后清理
    const sshRes = await api('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'ssh', target: 'testuser@localhost' }),
    })
    const sshSession = await sshRes.json()
    check('创建 SSH 会话(summary.sshTarget)',
      sshRes.status === 201 && sshSession.id && sshSession.sshTarget?.host === 'localhost' && sshSession.sshTarget?.user === 'testuser',
      JSON.stringify(sshSession.sshTarget))
    const sshDel = await api(`/api/sessions/${sshSession.id}`, { method: 'DELETE' })
    check('关闭 SSH 会话', sshDel.status === 204, String(sshDel.status))
    await api('/api/ssh-hosts', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: 'testuser', host: 'localhost', port: 22 }),
    })

    // 阶段C:SSH 对话视图(标注器模拟:远程提示符切分命令/输出,不再全屏锁定)
    {
      const evs = []
      const ann = new Osc133Annotator((ev) => evs.push(ev), () => null)
      // ssh 命令开始(OSC 133)
      ann.write('\x1b]133;A;/home\x07\x1b]133;B\x07ssh user@myserver\x1b]133;C\x07')
      // 密码提示(无换行)→ 静默后应触发 input_request(password)
      ann.write("user@myserver's password: ")
      await sleep(900)
      // 登录横幅(pre 阶段,进本地输出)+ 提示符 + 远程命令(回显与提示符同行)
      ann.write('\r\nWelcome to Ubuntu 24.04\r\nLast login: Mon\r\n')
      ann.write('user@myserver:~$ ls\r\n')
      ann.write('file1  file2\r\n')
      // 关键:提示符无换行到达 → 应立即收尾 ls(输出+结束),不憋到下一条命令
      ann.write('user@myserver:~$ ')
      const lsEnded = evs.some((e) => e.kind === 'command_end' && e.commandId.startsWith('r-'))
      const lsOut = evs.some(
        (e) => e.kind === 'output' && e.commandId.startsWith('r-') && e.content.includes('file1  file2'),
      )
      check('SSH 对话视图:提示符到达即收尾命令(不憋到下一条)', lsEnded, '')
      check('SSH 对话视图:命令输出立即发出(file1 file2)', lsOut, '')
      // 下一条命令(独立气泡)+ ssh 退出
      ann.write('exit\r\n')
      ann.write('\x1b]133;D;0\x07')
      ann.close(0)
      const remoteStarts = evs.filter((e) => e.kind === 'command_start' && e.commandId.startsWith('r-'))
      const remoteOuts = evs.filter((e) => e.kind === 'output' && e.commandId.startsWith('r-'))
      const remoteEnds = evs.filter((e) => e.kind === 'command_end' && e.commandId.startsWith('r-'))
      const pwReq = evs.find((e) => e.kind === 'input_request')
      check('SSH 对话视图:密码输入请求(password)',
        pwReq?.mode === 'password', JSON.stringify(pwReq?.prompt))
      check('SSH 对话视图:远程命令气泡(ls/exit)',
        remoteStarts.some((e) => e.text === 'ls') && remoteStarts.some((e) => e.text === 'exit'),
        JSON.stringify(remoteStarts.map((e) => e.text)))
      check('SSH 对话视图:远程命令结束事件齐全',
        remoteEnds.length === remoteStarts.length && remoteEnds.length >= 2, `${remoteEnds.length}/${remoteStarts.length}`)
      check('SSH 对话视图:不再触发全屏(无 fullscreen active 事件)',
        !evs.some((e) => e.kind === 'fullscreen' && e.status === 'active'),
        JSON.stringify(evs.filter((e) => e.kind === 'fullscreen')))
    }

    await waitFor(() => events.some((e) => e.type === 'cwd')) // 初始提示符
    await sleep(150)

    // 1. 简单同步命令
    send({ type: 'command', text: 'echo hello-liminal', clientMsgId: 'c1' })
    await waitFor(() => commandEnd(starts().at(-1)?.commandId))
    const s1 = starts().at(-1)
    const o1 = outputOf(s1.commandId)
    check('命令文本被正确标注', s1.text === 'echo hello-liminal', JSON.stringify(s1.text))
    check('输出内容正确', o1.includes('hello-liminal'), JSON.stringify(o1.trim()))
    check('退出码 0', commandEnd(s1.commandId).exitCode === 0)

    // 2. 非零退出码(注意:直接 `exit 3` 会退出整个 shell 会话)
    send({ type: 'command', text: 'bash -c "exit 3"', clientMsgId: 'c2' })
    await waitFor(() => commandEnd(starts().at(-1)?.commandId))
    check('非零退出码 3', commandEnd(starts().at(-1).commandId).exitCode === 3)

    // 3. cwd 变化被追踪
    send({ type: 'command', text: 'cd /tmp', clientMsgId: 'c3' })
    await waitFor(() => commandEnd(starts().at(-1)?.commandId))
    send({ type: 'command', text: 'pwd', clientMsgId: 'c4' })
    await waitFor(() => commandEnd(starts().at(-1)?.commandId))
    const s4 = starts().at(-1)
    check('cwd 标注更新为 /tmp', s4.cwd === '/tmp', JSON.stringify(s4.cwd))
    check('pwd 输出 /tmp', outputOf(s4.commandId).includes('/tmp'))

    // 4. Ctrl+C 中断长命令(SIGINT → exit code 130)
    send({ type: 'command', text: 'sleep 30', clientMsgId: 'c5' })
    await waitFor(() => starts().some((e) => e.text === 'sleep 30'))
    await sleep(300)
    send({ type: 'stdin', data: '\x03' })
    await waitFor(() => commandEnd(starts().find((e) => e.text === 'sleep 30')?.commandId))
    const ec5 = commandEnd(starts().find((e) => e.text === 'sleep 30').commandId).exitCode
    check('Ctrl+C 后命令结束', ec5 !== undefined)
    check('中断退出码为 130', ec5 === 130, `actual=${ec5}`)

    // 5. 真相层:原始字节一直在流动(包含 ANSI 提示符)
    check('原始字节流非空(真相层活着)', rawTotal > 0, `${rawTotal} bytes`)

    // 6. resize 控制通道
    send({ type: 'resize', cols: 120, rows: 40 })
    await sleep(300)
    send({ type: 'command', text: 'stty size', clientMsgId: 'c6' })
    await waitFor(() => commandEnd(starts().at(-1)?.commandId))
    check('resize 生效(stty size = 40 120)', outputOf(starts().at(-1).commandId).trim() === '40 120',
      JSON.stringify(outputOf(starts().at(-1).commandId).trim()))

    // 7. Tab 补全:命令位
    send({ type: 'complete', token: 101, text: 'ech', cursor: 3 })
    await waitFor(() => events.some((e) => e.type === 'completion' && e.token === 101))
    const c101 = events.find((e) => e.type === 'completion' && e.token === 101)
    check('命令位补全 ech → 含 echo', c101.items.includes('echo') && c101.mode === 'command',
      JSON.stringify(c101.items.slice(0, 5)))

    // 8. Tab 补全:参数位(文件,跟随会话 cwd=/tmp)
    send({ type: 'command', text: 'cd /usr', clientMsgId: 'c7' })
    await waitFor(() => commandEnd(starts().at(-1)?.commandId))
    await sleep(200)
    send({ type: 'complete', token: 102, text: 'ls /usr/lo', cursor: 9 })
    await waitFor(() => events.some((e) => e.type === 'completion' && e.token === 102))
    const c102 = events.find((e) => e.type === 'completion' && e.token === 102)
    check('文件位补全 /usr/lo → 含 /usr/local', c102.items.includes('/usr/local') && c102.mode === 'file',
      JSON.stringify(c102.items))

    // 9. 补全的词范围标注(cursor 处的词)
    send({ type: 'complete', token: 103, text: 'git sta', cursor: 7 })
    await waitFor(() => events.some((e) => e.type === 'completion' && e.token === 103))
    const c103 = events.find((e) => e.type === 'completion' && e.token === 103)
    check('词范围标注正确(git sta → start=4 end=7)',
      c103.start === 4 && c103.end === 7, JSON.stringify({ start: c103.start, end: c103.end }))

    // 9b. sudo 穿透:命令位补全(sudo ec<Tab> → 命令 echo,而非文件)
    send({ type: 'complete', token: 104, text: 'sudo ec', cursor: 7 })
    await waitFor(() => events.some((e) => e.type === 'completion' && e.token === 104))
    const c104 = events.find((e) => e.type === 'completion' && e.token === 104)
    check('sudo 穿透:sudo ec<Tab> 按命令位补全(含 echo)',
      c104.mode === 'command' && c104.items.includes('echo'), JSON.stringify(c104.items.slice(0, 5)))

    // 9c. sudo -u root 穿透(选项值后仍是命令位)
    send({ type: 'complete', token: 105, text: 'sudo -u root ec', cursor: 15 })
    await waitFor(() => events.some((e) => e.type === 'completion' && e.token === 105))
    const c105 = events.find((e) => e.type === 'completion' && e.token === 105)
    check('sudo -u root 穿透:sudo -u root ec<Tab> 按命令位补全(含 echo)',
      c105.mode === 'command' && c105.items.includes('echo'), JSON.stringify(c105.items.slice(0, 5)))

    // 10. 全屏程序:less 进入备用屏 → 发 q 退出
    send({ type: 'command', text: 'less /etc/hostname', clientMsgId: 'c10' })
    await waitFor(() => events.some((e) => e.type === 'fullscreen' && e.status === 'active'))
    check('检测到进入全屏(less)', true)
    await sleep(400)
    send({ type: 'stdin', data: 'q' })
    await waitFor(() => events.some((e) => e.type === 'fullscreen' && e.status === 'exited'), 10000)
    await waitFor(() => commandEnd(starts().find((e) => e.text.startsWith('less'))?.commandId), 10000)
    check('全屏退出且命令结束', true)

    // 11. 密码输入请求(read -s -p)
    send({ type: 'command', text: 'read -s -p "Password: " x; echo got=$x', clientMsgId: 'c11' })
    await waitFor(() => events.some((e) => e.type === 'input_request'), 10000)
    const ir1 = events.find((e) => e.type === 'input_request')
    check('密码输入请求被识别', ir1.kind === 'password', JSON.stringify(ir1).slice(0, 120))
    await sleep(200)
    send({ type: 'stdin', data: 'secret123\n' })
    await waitFor(() => commandEnd(starts().find((e) => e.text.startsWith('read -s'))?.commandId), 10000)
    const cmd11 = starts().find((e) => e.text.startsWith('read -s'))
    check('密码提交后命令完成且输出正确', outputOf(cmd11.commandId).includes('got=secret123'),
      JSON.stringify(outputOf(cmd11.commandId).trim()))

    // 12. 确认输入请求((y/n))
    send({ type: 'command', text: 'read -p "continue (y/n)? " a; echo ans=$a', clientMsgId: 'c12' })
    await waitFor(() => events.filter((e) => e.type === 'input_request').length >= 2, 10000)
    const ir2 = events.filter((e) => e.type === 'input_request').at(-1)
    check('确认输入请求被识别', ir2.kind === 'confirm', JSON.stringify(ir2).slice(0, 120))
    send({ type: 'stdin', data: 'y\n' })
    await waitFor(() => commandEnd(starts().find((e) => e.text.startsWith('read -p'))?.commandId), 10000)

    // 13. \r 进度行折叠:只保留最终态
    send({ type: 'command', text: 'for i in 1 2 3; do printf "\\r%d%%" $i; sleep 0.15; done; echo', clientMsgId: 'c13' })
    await waitFor(() => commandEnd(starts().find((e) => e.text.includes('printf'))?.commandId), 10000)
    const cmd13 = starts().find((e) => e.text.includes('printf'))
    const o13 = outputOf(cmd13.commandId)
    check('\\r 折叠:输出只含最终 3%', o13.includes('3%') && !o13.includes('1%') && !o13.includes('2%'),
      JSON.stringify(o13.trim()))

    // 14. TUI 名单识别:claude(内联 TUI,不发备用屏序列)→ 全屏态进出
    send({ type: 'command', text: 'claude --version', clientMsgId: 'c14' })
    await waitFor(() => commandEnd(starts().find((e) => e.text.startsWith('claude --version'))?.commandId), 15000)
    const fsActs = events.filter((e) => e.type === 'fullscreen')
    check('claude 触发名单全屏(进入+退出)', fsActs.some((e) => e.status === 'active') && fsActs.some((e) => e.status === 'exited'),
      JSON.stringify(fsActs.slice(-2)))

    // 15. TUI 名单识别 + sudo 前缀穿透(top 批处理模式)
    send({ type: 'command', text: 'sudo -n top -bn1 2>/dev/null || top -bn1', clientMsgId: 'c15' })
    await waitFor(() => commandEnd(starts().find((e) => e.text.includes('top'))?.commandId), 15000)
    const fsActs2 = events.filter((e) => e.type === 'fullscreen')
    const lastEnter = fsActs2.map((e) => e.status).lastIndexOf('active')
    const lastExit = fsActs2.map((e) => e.status).lastIndexOf('exited')
    check('top(含 sudo 前缀穿透)触发全屏态', lastEnter > -1 && lastExit > lastEnter, '')

    // 16. agy(Antigravity,启动期备用屏抖动的内联 TUI)名单锁定
    send({ type: 'command', text: 'agy --version', clientMsgId: 'c16' })
    await waitFor(() => commandEnd(starts().find((e) => e.text.startsWith('agy'))?.commandId), 15000)
    const cmd16 = starts().find((e) => e.text.startsWith('agy'))
    const fs16 = events.filter((e) => e.type === 'fullscreen' && e.commandId === cmd16.commandId)
    check('agy 名单触发全屏(进入+退出)',
      fs16.some((e) => e.status === 'active') && fs16.some((e) => e.status === 'exited'),
      JSON.stringify(fs16))

    // 17. 备用屏抖动宽限:1049h→l→h→l(间隔 200ms < 400ms 宽限)不产生中途退出
    send({ type: 'command', text: String.raw`printf '\e[?1049h'; sleep 0.2; printf '\e[?1049l'; sleep 0.2; printf '\e[?1049h'; sleep 0.6; printf '\e[?1049l'; echo ok`, clientMsgId: 'c17' })
    await waitFor(() => commandEnd(starts().find((e) => e.text.includes('1049h'))?.commandId), 15000)
    const cmd17 = starts().find((e) => e.text.includes('1049h'))
    const fs17 = events.filter((e) => e.type === 'fullscreen' && e.commandId === cmd17.commandId)
    check('备用屏抖动被宽限吸收(全程 1 进 1 出,无中途退出)',
      fs17.length === 2 && fs17[0].status === 'active' && fs17[1].status === 'exited',
      JSON.stringify(fs17))

    // 18. 结构化输出:git diff → output_structured(kind=diff)
    send({ type: 'command', text: 'rm -rf /tmp/tc-diff-repo && mkdir -p /tmp/tc-diff-repo && cd /tmp/tc-diff-repo && git init -q . && printf "hello\\n" > f.txt && git add . && git -c user.email=t@t -c user.name=t commit -qm init && printf "world\\n" >> f.txt && git diff', clientMsgId: 'c18' })
    await waitFor(() => commandEnd(starts().find((e) => e.text.includes('tc-diff-repo'))?.commandId), 20000)
    const cmd18 = starts().find((e) => e.text.includes('tc-diff-repo'))
    const st18 = events.find((e) => e.type === 'output_structured' && e.commandId === cmd18.commandId)
    check('git diff 结构化(kind=diff,文件 f.txt,+1 行)',
      st18 && st18.kind === 'diff' && st18.data.files?.[0]?.path === 'f.txt' && st18.data.files[0].additions === 1,
      st18 ? JSON.stringify(st18.data.files?.[0]?.path) : '无结构化事件')

    // 19. 结构化输出:纯 JSON → output_structured(kind=json)
    send({ type: 'command', text: `echo '{"name":"liminal","n":42}'`, clientMsgId: 'c19' })
    await waitFor(() => commandEnd(starts().find((e) => e.text.includes('"name"'))?.commandId), 10000)
    const cmd19 = starts().find((e) => e.text.includes('"name"'))
    const st19 = events.find((e) => e.type === 'output_structured' && e.commandId === cmd19.commandId)
    check('JSON 输出结构化(kind=json,字段可取)',
      st19 && st19.kind === 'json' && st19.data && st19.data.name === 'liminal' && st19.data.n === 42,
      st19 ? 'ok' : '无结构化事件')

    // 20. 危险命令拦截:未确认 → 阻断且不执行
    send({ type: 'command', text: 'rm -rf /', clientMsgId: 'c20' })
    await waitFor(() => events.some((e) => e.type === 'system' && e.text.includes('拦截')), 8000)
    const blockedOk = events.some((e) => e.type === 'system' && e.text.includes('拦截'))
    await sleep(600)
    check('危险命令未确认被服务端阻断(未执行)',
      blockedOk && !starts().some((e) => e.text === 'rm -rf /'), '')

    // 21. 危险命令:确认后放行(用安全目标 /tmp 下自建目录)
    send({ type: 'command', text: 'mkdir -p /tmp/tc-danger-ok && echo x > /tmp/tc-danger-ok/f', clientMsgId: 'c21' })
    await waitFor(() => commandEnd(starts().find((e) => e.text.includes('tc-danger-ok'))?.commandId), 10000)
    send({ type: 'command', text: 'rm -rf /tmp/tc-danger-ok/*', clientMsgId: 'c22', confirmed: true })
    await waitFor(() => commandEnd(starts().find((e) => e.text.includes('tc-danger-ok/*'))?.commandId), 10000)
    const cmd22 = starts().find((e) => e.text.includes('tc-danger-ok/*'))
    check('确认后危险命令放行执行', !!commandEnd(cmd22?.commandId), '')

    ws.close()

    // 22. 断线重连:关闭连接后重开,attach 续接同一会话并重放
    const ws2 = new WebSocket(URL, WS_OPTIONS)
    const replayEvents = []
    let replayRaw = 0
    ws2.on('message', (raw) => {
      const msg = JSON.parse(raw.toString('utf8'))
      if (msg.type === 'ready' && !msg.resumed) return
      if (msg.type === 'raw') {
        replayRaw += Buffer.from(msg.data, 'base64').length
      } else if (msg.type === 'replay') {
        replayEvents.push(...msg.events)
        replayRaw += Buffer.from(msg.raw || '', 'base64').length
      } else {
        replayEvents.push(msg)
      }
    })
    await new Promise((r) => ws2.on('open', r))
    ws2.send(JSON.stringify({ type: 'attach', sessionId: mySessionId, lastSeq: 0, wantRaw: true }))
    await waitFor(() => replayEvents.some((e) => e.type === 'ready' && e.resumed), 8000)
    await sleep(600)
    check('重连续接同一会话(resumed=true)',
      replayEvents.some((e) => e.type === 'ready' && e.resumed), '')
    check('重放包含历史命令标注(echo hello-liminal)',
      replayEvents.some((e) => e.type === 'command_start' && e.text === 'echo hello-liminal'), '')
    check('重放包含原始字节(真相层可重建)', replayRaw > 1000, `${replayRaw} bytes`)
    ws2.close()

    ws.close()
    const failed = results.filter((r) => !r.ok)
    console.log(failed.length === 0 ? '\n全部通过 🎉' : `\n${failed.length} 项失败`)
    process.exit(failed.length === 0 ? 0 : 1)
  } catch (err) {
    console.error('测试异常:', err.message)
    ws.close()
    process.exit(1)
  }
})

ws.on('error', (err) => {
  console.error('连接失败(服务是否已启动?):', err.message)
  process.exit(1)
})
