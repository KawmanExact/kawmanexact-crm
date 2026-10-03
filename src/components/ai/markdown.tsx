'use client'

import * as React from 'react'

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="rounded bg-white/[0.07] border border-white/10 px-1.5 py-0.5 text-[0.82em] font-mono text-purple-200">
          {part.slice(1, -1)}
        </code>
      )
    }
    return <React.Fragment key={i}>{part}</React.Fragment>
  })
}

function TableBlock({ lines }: { lines: string[] }) {
  if (lines.length < 2) return null
  const headerCells = lines[0]
    .split('|')
    .map((c) => c.trim())
    .filter(Boolean)
  const bodyRows = lines.slice(2).map((l) =>
    l
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean)
  )
  // second line is separator like |---|---|
  return (
    <div className="my-5 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02]">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-white/[0.04] border-b border-white/[0.06]">
              {headerCells.map((h, i) => (
                <th key={i} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white/60 whitespace-nowrap">
                  {renderInline(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {bodyRows.map((row, ri) => (
              <tr key={ri} className="hover:bg-white/[0.02] transition-colors">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-4 py-2.5 text-[13.5px] leading-relaxed text-white/75">
                    {renderInline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function Markdown({ content, className }: { content: string; className?: string }) {
  const lines = content.split('\n')
  const blocks: React.ReactNode[] = []
  let listBuffer: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let tableBuffer: string[] = []
  let blockquoteBuffer: string[] = []

  function flushList() {
    if (listBuffer.length === 0) return
    const items = listBuffer.map((item, i) => (
      <li key={i} className="pl-1 leading-[1.7] text-white/75 marker:text-purple-400/70">
        {renderInline(item)}
      </li>
    ))
    if (listType === 'ol') {
      blocks.push(
        <ol key={blocks.length} className="list-decimal pl-5 space-y-1.5 my-3 marker:text-white/40">
          {items}
        </ol>
      )
    } else {
      blocks.push(
        <ul key={blocks.length} className="list-disc pl-5 space-y-1.5 my-3">
          {items}
        </ul>
      )
    }
    listBuffer = []
    listType = null
  }

  function flushTable() {
    if (tableBuffer.length === 0) return
    blocks.push(<TableBlock key={blocks.length} lines={[...tableBuffer]} />)
    tableBuffer = []
  }

  function flushBlockquote() {
    if (blockquoteBuffer.length === 0) return
    blocks.push(
      <blockquote
        key={blocks.length}
        className="my-4 rounded-r-lg border-l-2 border-purple-500/40 bg-white/[0.03] px-4 py-3 text-[13.5px] leading-relaxed text-white/70 italic"
      >
        {blockquoteBuffer.map((l, i) => (
          <p key={i} className={i > 0 ? 'mt-1.5' : ''}>
            {renderInline(l)}
          </p>
        ))}
      </blockquote>
    )
    blockquoteBuffer = []
  }

  const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l)
  const isSeparatorRow = (l: string) => /^\s*\|?[\s-|:]+\|[\s-|:]*\|?\s*$/.test(l)

  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx]
    const line = raw.trimEnd()

    // table handling — collect consecutive | rows
    if (isTableRow(line)) {
      flushList()
      flushBlockquote()
      tableBuffer.push(line)
      const next = lines[idx + 1]?.trimEnd() ?? ''
      const isNextTable = isTableRow(next) || isSeparatorRow(next)
      if (!isNextTable) flushTable()
      continue
    }
    flushTable()

    const bulletMatch = line.match(/^\s*[-*]\s+(.*)/)
    const numberedMatch = line.match(/^\s*\d+[.)]\s+(.*)/)
    const blockquoteMatch = line.match(/^\s*>\s?(.*)/)
    const hrMatch = line.match(/^\s*([-*_]\s*){3,}\s*$/)
    const h3 = line.match(/^###\s+(.*)/)
    const h2 = line.match(/^##\s+(.*)/)
    const h1 = line.match(/^#\s+(.*)/)

    if (blockquoteMatch) {
      flushList()
      blockquoteBuffer.push(blockquoteMatch[1])
      const next = lines[idx + 1]?.trimEnd() ?? ''
      if (!next.match(/^\s*>\s?/)) flushBlockquote()
      continue
    }
    flushBlockquote()

    if (hrMatch) {
      flushList()
      blocks.push(<hr key={blocks.length} className="my-6 border-white/10" />)
      continue
    }

    if (bulletMatch) {
      if (listType !== 'ul') flushList()
      listType = 'ul'
      listBuffer.push(bulletMatch[1])
      continue
    }
    if (numberedMatch) {
      if (listType !== 'ol') flushList()
      listType = 'ol'
      listBuffer.push(numberedMatch[1])
      continue
    }
    flushList()

    if (h3) {
      blocks.push(
        <h3 key={blocks.length} className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-white/55 mt-7 mb-2">
          {renderInline(h3[1])}
        </h3>
      )
    } else if (h2) {
      blocks.push(
        <h2 key={blocks.length} className="group flex items-center gap-3 text-[15px] font-semibold tracking-tight text-white mt-8 mb-3">
          <span className="h-5 w-0.5 rounded-full bg-gradient-to-b from-violet-500 to-fuchsia-500 shrink-0" />
          {renderInline(h2[1])}
        </h2>
      )
    } else if (h1) {
      blocks.push(
        <div key={blocks.length} className="mt-8 mb-4 pb-4 border-b border-white/[0.07]">
          <h1 className="text-xl font-bold tracking-tight text-white">{renderInline(h1[1])}</h1>
        </div>
      )
    } else if (line.trim() === '') {
      // skip blank lines
    } else {
      blocks.push(
        <p key={blocks.length} className="text-[14px] leading-[1.75] text-white/75">
          {renderInline(line)}
        </p>
      )
    }
  }
  flushList()
  flushTable()
  flushBlockquote()

  return <div className={className}>{blocks}</div>
}
