/**
 * 结构化输出视图:git diff 分块高亮 + JSON 可折叠树。
 * 数据来自服务端旁路解析(output_structured);原文始终保留在气泡里,可一键切回。
 */

import { useState } from 'react'

/* ---- Diff ---- */

interface DiffLine {
  type: 'add' | 'del' | 'ctx' | 'meta'
  text: string
}
interface DiffFile {
  path: string
  additions: number
  deletions: number
  isBinary: boolean
  hunks: Array<{ header: string; lines: DiffLine[] }>
}
interface DiffData {
  files: DiffFile[]
}

const LINE_STYLE: Record<DiffLine['type'], string> = {
  add: 'bg-brand/10 text-brand-deep',
  del: 'bg-danger/10 text-danger',
  ctx: 'text-ink',
  meta: 'text-ink-2 italic',
}
const LINE_MARK: Record<DiffLine['type'], string> = {
  add: '+',
  del: '-',
  ctx: ' ',
  meta: '\\',
}

export function DiffView({ data }: { data: DiffData }) {
  return (
    <div className="divide-y divide-line/50">
      {data.files.map((f) => (
        <div key={f.path}>
          <div className="flex items-center gap-2 px-3.5 py-1.5">
            <span className="font-mono-term term-fs truncate font-medium text-ink" title={f.path}>
              {f.path}
            </span>
            <span className="shrink-0 rounded bg-brand/15 px-1.5 text-[10px] font-medium text-brand-deep">
              +{f.additions}
            </span>
            <span className="shrink-0 rounded bg-danger/15 px-1.5 text-[10px] font-medium text-danger">
              -{f.deletions}
            </span>
          </div>
          {f.isBinary ? (
            <div className="px-3.5 pb-2 text-[11px] text-ink-2">二进制文件</div>
          ) : (
            f.hunks.map((h, i) => (
              <div key={i}>
                <div className="font-mono-term bg-ink/5 px-3.5 py-0.5 text-[11px] text-ink-2">
                  {h.header}
                </div>
                <pre className="font-mono-term term-fs overflow-x-auto py-1 leading-[1.5]">
                  {h.lines.map((l, j) => (
                    <div key={j} className={`px-3.5 ${LINE_STYLE[l.type]}`}>
                      <span className="mr-1.5 inline-block w-2 select-none opacity-60">
                        {LINE_MARK[l.type]}
                      </span>
                      {l.text || ' '}
                    </div>
                  ))}
                </pre>
              </div>
            ))
          )}
        </div>
      ))}
    </div>
  )
}

/* ---- JSON ---- */

function JsonNode({ value, name, depth }: { value: unknown; name?: string; depth: number }) {
  const [open, setOpen] = useState(depth < 2)

  if (value !== null && typeof value === 'object') {
    const isArr = Array.isArray(value)
    const entries = isArr
      ? (value as unknown[]).map((v, i) => [String(i), v] as const)
      : Object.entries(value as Record<string, unknown>)
    return (
      <div className="pl-3.5">
        <button
          onClick={() => setOpen((v) => !v)}
          className="font-mono-term term-fs hover:bg-ink/5 inline-flex items-center gap-1 rounded px-0.5"
        >
          <span className="text-ink-2 w-3 select-none">{open ? '▾' : '▸'}</span>
          {name !== undefined && <span className="text-brand-deep">{name}</span>}
          <span className="text-ink-2">{isArr ? `[${entries.length}]` : `{${entries.length}}`}</span>
        </button>
        {open && (
          <div className="border-l border-line pl-1">
            {entries.map(([k, v]) => (
              <JsonNode key={k} name={isArr ? undefined : k} value={v} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  let rendered: React.ReactNode
  let color = 'text-ink'
  if (typeof value === 'string') {
    rendered = `"${value}"`
    color = 'text-brand-deep'
  } else if (typeof value === 'number') {
    rendered = String(value)
    color = 'text-sky-600'
  } else if (typeof value === 'boolean') {
    rendered = String(value)
    color = 'text-purple-600'
  } else {
    rendered = 'null'
    color = 'text-ink-2'
  }
  return (
    <div className="font-mono-term term-fs flex gap-1.5 pl-3.5">
      <span className="w-3 select-none" />
      {name !== undefined && <span className="text-brand-deep">{name}</span>}
      <span className={color}>{rendered}</span>
    </div>
  )
}

export function JsonView({ data }: { data: unknown }) {
  return (
    <div className="max-h-[420px] overflow-auto py-1.5">
      <JsonNode value={data} depth={0} />
    </div>
  )
}
