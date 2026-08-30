export type Language = 'zh' | 'en'

export const I18N = {
  zh: {
    // 顶栏 (Header)
    sessions: '会话',
    settings: '设置',
    terminalView: '终端视图',
    returnToChat: '返回对话',
    search: '搜索 (Ctrl+F)',
    exportMarkdown: '导出记录 (Markdown)',
    statusConnected: '已连接',
    statusConnecting: '连接中',
    statusReconnecting: '重连中',
    nestedShell: '嵌套环境',
    fullscreenActive: '全屏程序运行中',

    // 输入条 (InputBar)
    inputPlaceholderReady: '输入命令或 / 快捷指令 · ↑/↓ 历史 · Tab 补全',
    inputPlaceholderRunning: '命令运行中,回车将作为输入发送(Ctrl+C 中断)',
    inputPlaceholderFullscreen: '全屏程序运行中(在终端视图里交互),此处输入将发送给程序',
    inputPlaceholderConnecting: '等待连接…',
    send: '发送',
    stopCtrlC: '发送 Ctrl+C',
    tabComplete: 'Tab 补全',
    compModeCommand: '命令',
    compModeFile: '参数 / 文件',
    compTotal: (count: number) => `共 ${count} 项 · Tab 循环 ↑↓ 选择 Enter 确认 Esc 关闭`,
    dangerTitle: '⚠️ 危险命令,确认执行?',
    dangerProceed: '仍要执行',
    dangerCancel: '取消',
    dangerServerNotice: '服务端同样拦截未确认的危险命令',
    chatCleared: '✨ 聊天界面已清空',
    chatClearedCtrlL: '✨ 聊天界面已清空 (Ctrl+L)',
    helpGuide:
      '💡 Kissa 常用快捷指南:\n' +
      '• /clear - 清空界面对话气泡\n' +
      '• /export - 导出完整对话流为 Markdown\n' +
      '• /ssh - 快速管理并连接远程主机\n' +
      '• ↑ / ↓ - 回溯浏览历史执行命令\n' +
      '• Tab - 智能补全 / 光标不在输入框时一键聚焦\n' +
      '• Ctrl+F - 检索历史命令与输出内容\n' +
      '• Ctrl+L - 清空对话流\n' +
      '• Ctrl+C - 中断当前正在运行的命令',

    // 气泡 (Bubbles)
    running: '运行中',
    completed: '✓ 完成',
    failedExit: (code: number | string) => `✗ 失败 · exit code ${code}`,
    ended: '已结束',
    stop: '停止',
    structuredView: '结构化视图',
    viewRaw: '查看原文',
    expandLines: (count: number) => `展开(${count}行)`,
    collapse: '折叠',
    copy: '复制',
    copied: '已复制',
    reFill: '重填',
    copyCommand: '复制命令',
    refillCommand: '重新填入输入框',
    copyOutput: '复制输出',
    collapseOutput: '折叠输出',
    expandOutput: '展开输出',
    interruptCommand: '中断执行 (Ctrl+C)',
    collapsedMiddle: (count: number, total: number) =>
      `⋯ 中间已折叠 ${count} 行,点击展开完整输出(共 ${total} 行)`,
    submitted: (v: string) => `已提交:${v}`,
    yes: '是 (y)',
    no: '否 (n)',
    submit: '提交',
    pwdPlaceholder: '输入密码,回车提交',
    textPromptPlaceholder: '输入内容,回车提交',

    // 终端视图 (TerminalPane)
    terminalPaneSubFullscreen: '全屏程序运行中 — 键盘直接操作程序,退出后自动返回对话',
    terminalPaneSubTruth: '真实终端(事实来源)— 键盘输入直接进入 PTY',
    close: '关闭',

    // 搜索 (SearchOverlay)
    searchPlaceholder: '搜索命令或输出...',
    noResults: '无结果',
    prevMatch: '上一个 (Shift+Enter)',
    nextMatch: '下一个 (Enter)',
    closeSearch: '关闭 (Esc)',

    // 会话面板 (SessionPanel)
    sessionTitle: '会话管理',
    newSession: '+ 新建会话',
    sshConnect: '🔗 SSH 连接',
    renameTerminal: '重命名终端',
    renamePlaceholder: '终端名(留空恢复默认)',
    save: '保存',
    cancel: '取消',
    sessionConnected: '已连接',
    sessionBgAlive: '后台保活',
    modeSandbox: '隔离',
    modeHost: '本机',
    deleteSession: '关闭会话',
    defaultSessionName: '终端会话',
    loadSessionFailed: '无法加载会话列表',
    createSessionFailed: '无法创建会话',
    closeSessionFailed: '无法关闭会话',

    // SSH 弹窗 (SshDialog)
    sshDialogTitle: '🔗 新建 SSH 连接',
    sshInputPlaceholder: 'user@host 或 host[:port]',
    connect: '连接',
    formatError: '格式应为 user@host[:port]',
    recentConnections: '最近连接',
    times: '次',
    deleteRecord: '删除记录',
    connectFailed: '连接失败',

    // 设置 (SettingsModal)
    settingsTitle: '设置',
    appearance: '外观模式',
    themeLight: '浅色',
    themeDark: '深色',
    themeAuto: '跟随系统',

    avatars: '头像设置',
    avatarUser: '用户',
    avatarTerm: '终端',
    avatarUpload: '上传图片',
    avatarDefault: '恢复默认',
    avatarSizeError: '图片需小于 1MB',
    avatarTypeError: '请选择图片文件',

    bubbleTheme: '气泡配色',
    bubbleWechat: '微信',
    bubbleWhatsapp: 'WhatsApp',
    bubbleImessage: 'iMessage',

    typographyAndColors: '终端排版与配色',
    colorScheme: '终端色彩方案',
    fontFamily: '终端字体',
    fontSize: '终端字号',
    fontSizeSmall: '小',
    fontSizeLarge: '大',
    livePreview: '色彩与排版实时预览',

    schemeDefault: '默认',
    schemeDracula: '德古拉',
    schemeOneDark: '极客暗黑',
    schemeMonokai: '莫诺卡伊',
    schemeNord: '北极光',
    schemeSolarized: '日光',

    fontDefault: '默认等宽',
    fontMonospace: '标准等宽',

    language: '界面语言',
    langZh: '简体中文',
    langEn: 'English',

    previewPrompt: 'user@kissa:~/project$ ls -la',
    previewWarn: '[提示] 构建完成，0 处错误。',
  },
  en: {
    // Top bar (Header)
    sessions: 'Sessions',
    settings: 'Settings',
    terminalView: 'Terminal View',
    returnToChat: 'Return to Chat',
    search: 'Search (Ctrl+F)',
    exportMarkdown: 'Export Transcript (Markdown)',
    statusConnected: 'Connected',
    statusConnecting: 'Connecting',
    statusReconnecting: 'Reconnecting',
    nestedShell: 'Nested Env',
    fullscreenActive: 'Fullscreen App Active',

    // Input bar (InputBar)
    inputPlaceholderReady: 'Enter command or / shortcut · ↑/↓ History · Tab Complete',
    inputPlaceholderRunning: 'Command running, Enter sends input (Ctrl+C to interrupt)',
    inputPlaceholderFullscreen: 'Fullscreen app running (interact in terminal view), input here sends to app',
    inputPlaceholderConnecting: 'Connecting to server…',
    send: 'Send',
    stopCtrlC: 'Send Ctrl+C',
    tabComplete: 'Tab Completion',
    compModeCommand: 'Command',
    compModeFile: 'Arguments / Files',
    compTotal: (count: number) => `Total ${count} items · Tab to cycle ↑↓ select Enter to confirm Esc to close`,
    dangerTitle: '⚠️ Dangerous command, proceed?',
    dangerProceed: 'Run Anyway',
    dangerCancel: 'Cancel',
    dangerServerNotice: 'Server will also intercept unconfirmed dangerous commands',
    chatCleared: '✨ Chat cleared',
    chatClearedCtrlL: '✨ Chat cleared (Ctrl+L)',
    helpGuide:
      '💡 Kissa Shortcuts Guide:\n' +
      '• /clear - Clear chat messages\n' +
      '• /export - Export conversation as Markdown\n' +
      '• /ssh - Manage and connect to SSH hosts\n' +
      '• ↑ / ↓ - Browse command history\n' +
      '• Tab - Smart autocomplete / focus input when unfocused\n' +
      '• Ctrl+F - Search history and command outputs\n' +
      '• Ctrl+L - Clear chat conversation\n' +
      '• Ctrl+C - Interrupt current running command',

    // Bubbles
    running: 'Running',
    completed: '✓ Done',
    failedExit: (code: number | string) => `✗ Failed · exit code ${code}`,
    ended: 'Ended',
    stop: 'Stop',
    structuredView: 'Structured View',
    viewRaw: 'Raw Output',
    expandLines: (count: number) => `Expand (${count} lines)`,
    collapse: 'Collapse',
    copy: 'Copy',
    copied: 'Copied',
    reFill: 'Fill',
    copyCommand: 'Copy Command',
    refillCommand: 'Fill into Input',
    copyOutput: 'Copy Output',
    collapseOutput: 'Collapse',
    expandOutput: 'Expand',
    interruptCommand: 'Interrupt (Ctrl+C)',
    collapsedMiddle: (count: number, total: number) =>
      `⋯ Folded ${count} lines in between, click to expand all (${total} lines)`,
    submitted: (v: string) => `Submitted: ${v}`,
    yes: 'Yes (y)',
    no: 'No (n)',
    submit: 'Submit',
    pwdPlaceholder: 'Enter password, press Enter to submit',
    textPromptPlaceholder: 'Enter text, press Enter to submit',

    // Terminal view (TerminalPane)
    terminalPaneSubFullscreen: 'Fullscreen program active — interact with keyboard, returns to chat on exit',
    terminalPaneSubTruth: 'Real Terminal (Truth Layer) — Keyboard input goes directly to PTY',
    close: 'Close',

    // Search (SearchOverlay)
    searchPlaceholder: 'Search commands or output...',
    noResults: 'No results',
    prevMatch: 'Previous (Shift+Enter)',
    nextMatch: 'Next (Enter)',
    closeSearch: 'Close (Esc)',

    // Sessions panel (SessionPanel)
    sessionTitle: 'Sessions',
    newSession: '+ New Session',
    sshConnect: '🔗 SSH',
    renameTerminal: 'Rename Session',
    renamePlaceholder: 'Session name (leave empty for default)',
    save: 'Save',
    cancel: 'Cancel',
    sessionConnected: 'Connected',
    sessionBgAlive: 'Active in background',
    modeSandbox: 'Isolated',
    modeHost: 'Host',
    deleteSession: 'Close Session',
    defaultSessionName: 'Terminal Session',
    loadSessionFailed: 'Failed to load sessions',
    createSessionFailed: 'Failed to create session',
    closeSessionFailed: 'Failed to close session',

    // SSH Dialog (SshDialog)
    sshDialogTitle: '🔗 New SSH Connection',
    sshInputPlaceholder: 'user@host or host[:port]',
    connect: 'Connect',
    formatError: 'Format should be user@host[:port]',
    recentConnections: 'Recent Connections',
    times: 'times',
    deleteRecord: 'Delete Record',
    connectFailed: 'Connection failed',

    // Settings (SettingsModal)
    settingsTitle: 'Settings',
    appearance: 'Appearance',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeAuto: 'Auto',

    avatars: 'Avatar Settings',
    avatarUser: 'User',
    avatarTerm: 'Terminal',
    avatarUpload: 'Upload',
    avatarDefault: 'Reset',
    avatarSizeError: 'Image must be under 1MB',
    avatarTypeError: 'Please select an image file',

    bubbleTheme: 'Bubble Style',
    bubbleWechat: 'WeChat',
    bubbleWhatsapp: 'WhatsApp',
    bubbleImessage: 'iMessage',

    typographyAndColors: 'Typography & Colors',
    colorScheme: 'Color Scheme',
    fontFamily: 'Font Family',
    fontSize: 'Font Size',
    fontSizeSmall: 'Small',
    fontSizeLarge: 'Large',
    livePreview: 'Live Preview',

    schemeDefault: 'Default',
    schemeDracula: 'Dracula',
    schemeOneDark: 'One Dark',
    schemeMonokai: 'Monokai',
    schemeNord: 'Nord',
    schemeSolarized: 'Solarized',

    fontDefault: 'Default Monospace',
    fontMonospace: 'Standard Monospace',

    language: 'Language',
    langZh: '简体中文',
    langEn: 'English',

    previewPrompt: 'user@kissa:~/project$ ls -la',
    previewWarn: '[WARN] Build completed with 0 errors.',
  },
} as const

export function t(lang: Language) {
  return I18N[lang] ?? I18N.zh
}
