const token = new URLSearchParams(window.location.search).get('token') ?? ''

/** 供 img 等无法附加自定义请求头的资源使用。 */
export function authenticatedApiUrl(path: string): string {
  if (!token) return path
  return `${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
}

export function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (token) {
    headers.set('x-kissa-token', token)
    headers.set('x-liminal-token', token)
  }
  return fetch(input, { ...init, headers })
}

export function websocketPath(): string {
  return token ? `/ws?token=${encodeURIComponent(token)}` : '/ws'
}
