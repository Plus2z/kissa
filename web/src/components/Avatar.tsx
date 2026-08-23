/**
 * 头像渲染:设置里的自定义配置(图片)优先,否则用默认——
 * - 用户默认:系统用户头像(/api/user-avatar,服务端读 ~/.face / AccountsService),
 *   不可用时回退微信蓝 "我"
 * - 终端默认:应用图标(/icon.png)
 */

import type { AvatarCfg } from '../settings'
import { useSettings } from '../settings'
import { authenticatedApiUrl } from '../auth'

const APP_ICON_URL = `${import.meta.env.BASE_URL}icon.png`

export function Avatar({
  cfg,
  kind,
  className = 'h-[54px] w-[54px]',
}: {
  cfg: AvatarCfg
  kind: 'user' | 'term'
  className?: string
}) {
  const sysAvatarAvailable = useSettings((s) => s.sysAvatarAvailable)

  if (cfg?.kind === 'image') {
    return (
      <img
        src={cfg.value}
        alt={kind === 'user' ? '用户头像' : '终端头像'}
        className={`shrink-0 rounded-lg border border-line object-cover shadow-sm ${className}`}
      />
    )
  }
  if (cfg?.kind === 'emoji') {
    // 兼容已持久化的旧 emoji 配置:继续按原样显示
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-lg border border-line bg-panel shadow-sm ${className}`}
        style={{ fontSize: '1.15em' }}
      >
        {cfg.value}
      </div>
    )
  }
  // 默认
  if (kind === 'user' && sysAvatarAvailable) {
    return (
      <img
        src={authenticatedApiUrl('/api/user-avatar')}
        alt="系统用户头像"
        className={`shrink-0 rounded-lg border border-line object-cover shadow-sm ${className}`}
      />
    )
  }
  if (kind === 'term') {
    return (
      <img
        src={APP_ICON_URL}
        alt="应用图标"
        className={`shrink-0 rounded-lg object-cover shadow-sm ${className}`}
      />
    )
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-lg bg-[#576b95] text-[13px] font-medium text-white shadow-sm ${className}`}
    >
      我
    </div>
  )
}

/** 兼容旧 emoji 类型的类型保留(配置里可能存着) */
export type { AvatarCfg }
