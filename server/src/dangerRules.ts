/**
 * 危险命令规则库(前后端共用同一份,服务端通过 /api/danger-rules 下发)。
 *
 * 双重拦截:前端发送前弹确认(UX 层),服务端收到未确认的危险命令直接阻断
 * (安全层,前端可绕过但服务端不可)。命中且 confirmed 才放行。
 */

export interface DangerRule {
  id: string
  /** 正则源(字符串形式,前后端共享) */
  pattern: string
  /** 命中时展示给用户的说明 */
  message: string
}

export const DANGER_RULES: DangerRule[] = [
  {
    id: 'rm-rf-root',
    pattern: String.raw`\brm\s+[^|;&><]*-[a-zA-Z]*[rf][a-zA-Z]*[^|;&><]*\s+(/|~|\*(\s|$)|\$HOME)(\s|$)`,
    message: '递归删除根目录/家目录级别的文件,不可恢复',
  },
  {
    id: 'rm-rf-glob',
    pattern: String.raw`\brm\s+[^|;&><]*-[a-zA-Z]*r[a-zA-Z]*f?[^|;&><]*\s+\S*/\*`,
    message: '递归删除目录下全部内容',
  },
  {
    id: 'fork-bomb',
    pattern: String.raw`:\(\)\s*\{\s*:\|:&?\s*\}\s*;?\s*:`,
    message: 'fork 炸弹,会耗尽系统进程资源',
  },
  {
    id: 'mkfs',
    pattern: String.raw`\b(mkfs(\.\w+)?|wipefs|blkdiscard)\b`,
    message: '格式化/擦除块设备,数据全部丢失',
  },
  {
    id: 'dd-to-device',
    pattern: String.raw`\bdd\b[^|;&]*\bof=/dev/(sd|nvme|hd|vd|mmcblk)`,
    message: 'dd 直接写入物理磁盘,会毁掉分区数据',
  },
  {
    id: 'redirect-to-device',
    pattern: String.raw`>\s*/dev/(sd|nvme|hd|vd|mmcblk)`,
    message: '输出重定向到物理磁盘设备',
  },
  {
    id: 'chmod-777-root',
    pattern: String.raw`\bchmod\s+(-[a-zA-Z]*R[a-zA-Z]*\s+)+777\s+/(\s|$)`,
    message: '对根目录递归放开全部权限,破坏系统安全',
  },
  {
    id: 'sql-drop',
    pattern: String.raw`\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b`,
    message: 'SQL 删除表/库,数据不可恢复',
  },
  {
    id: 'git-push-force',
    pattern: String.raw`\bgit\s+push\s+[^|;&]*(\s|=)(-f|--force)(\s|=|$|(?!\w))`,
    message: '强制推送会覆盖远端历史,他人的提交可能丢失',
  },
]

/** 编译好的匹配器(服务端内部用) */
const compiled = DANGER_RULES.map((r) => ({ rule: r, re: new RegExp(r.pattern) }))

/** 返回命中的第一条规则;安全起见单条即拦截 */
export function matchDanger(text: string): DangerRule | null {
  for (const { rule, re } of compiled) {
    if (re.test(text)) return rule
  }
  return null
}
