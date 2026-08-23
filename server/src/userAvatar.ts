/**
 * 系统用户头像查找:默认"用户头像"直接读当前系统用户的头像。
 * 按桌面环境惯例逐个尝试(顺序 = 可靠性):
 *   1. ~/.face                        KDE / XFCE / LightDM 惯例
 *   2. /var/lib/AccountsService/icons/<user>  GNOME 惯例(目录全局可读,
 *      不依赖 users/<user> 配置文件的读权限)
 *   3. AccountsService users/<user> 的 Icon= 指向的文件(GNOME 旧位置/自定义路径,
 *      支持 file:// 前缀;该文件可能无权限,读不到就跳过)
 *   4. ~/.face.icon                   部分发行版(SDDM 等)使用
 */

import { existsSync, readFileSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { join } from 'node:path'

export interface SystemAvatar {
  data: Buffer
  contentType: string
}

/** 魔数嗅探:不依赖文件扩展名(AccountsService 的图标文件就没有后缀) */
function sniff(buf: Buffer): string | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png'
  }
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  if (buf.length > 6 && buf.subarray(0, 6).toString('ascii').startsWith('GIF8')) return 'image/gif'
  if (buf.length > 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp'
  }
  if (buf.length > 4 && buf.subarray(0, 4).toString('ascii') === '<svg') return 'image/svg+xml'
  return null
}

export function findSystemUserAvatar(): SystemAvatar | null {
  const user = userInfo().username
  const candidates: string[] = [
    join(homedir(), '.face'),
    join('/var/lib/AccountsService/icons', user),
    join(homedir(), '.face.icon'),
  ]

  // AccountsService users/<user> 的 Icon= 路径(可能在 [User] 段下,全文件解析)
  try {
    const userFile = join('/var/lib/AccountsService/users', user)
    if (existsSync(userFile)) {
      const m = readFileSync(userFile, 'utf8').match(/^\s*Icon\s*=\s*(.+)$/m)
      if (m) {
        let p = m[1]!.trim()
        if (p.startsWith('file://')) p = p.slice('file://'.length)
        if (p.length > 0) candidates.push(p)
      }
    }
  } catch {
    /* 无权限或不存在:跳过(上面的 icons/<user> 直读路径已覆盖 GNOME) */
  }

  for (const p of candidates) {
    try {
      if (p.length === 0 || !existsSync(p)) continue
      const data = readFileSync(p)
      const type = sniff(data)
      if (type) return { data, contentType: type }
    } catch {
      /* 单个来源失败继续尝试下一个 */
    }
  }
  return null
}
