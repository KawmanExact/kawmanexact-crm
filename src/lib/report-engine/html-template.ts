import type {
  UniversalReportDefinition,
  ReportMetric,
  ReportTable,
  ReportChart,
  ReportInsight,
} from './types'
import { normalizeReport } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fmtCell(value: unknown, format?: string): string {
  if (value == null || value === '') return '—'
  const s = String(value)
  if (format === 'currency') {
    const n = Number(String(value).replace(/[₹,\s]/g, ''))
    if (!Number.isFinite(n)) return esc(s)
    return esc(`₹${n.toLocaleString('en-IN')}`)
  }
  if (format === 'number') {
    const n = Number(value)
    return Number.isFinite(n) ? esc(n.toLocaleString('en-IN')) : esc(s)
  }
  if (format === 'percent') {
    const n = Number(String(value).replace('%',''))
    return Number.isFinite(n) ? esc(`${n}%`) : esc(s)
  }
  if (format === 'date' || format === 'datetime') {
    const d = new Date(String(value))
    if (isNaN(d.getTime())) return esc(s)
    return esc(format === 'datetime' ? d.toLocaleString('en-IN') : d.toLocaleDateString('en-IN'))
  }
  // preserve **bold** inline
  if (s.includes('**')) {
    const parts = s.split(/(\*\*[^*]+\*\*)/g)
    return parts.map(p => p.startsWith('**') && p.endsWith('**') ? `<strong>${esc(p.slice(2,-2))}</strong>` : esc(p)).join('')
  }
  return esc(s)
}

function shouldLandscape(def: UniversalReportDefinition): boolean {
  if (def.orientation === 'portrait') return false
  if (def.orientation === 'landscape') return true
  const tables: ReportTable[] = [
    ...(def.tables ?? []),
    ...(def.sections?.flatMap(s => s.tables ?? []) ?? []),
  ]
  if (def.columns && def.rows) tables.push({ columns: def.columns, rows: def.rows })
  return tables.some(t => t.columns.length >= 7)
}

// ---------------------------------------------------------------------------
// KPI / Metrics HTML
// ---------------------------------------------------------------------------
function toneAccent(tone?: ReportMetric['tone']): string {
  switch (tone) {
    case 'success': return '#059669'
    case 'warning': return '#d97706'
    case 'danger': return '#dc2626'
    case 'info': return '#2563eb'
    default: return '#0F1D3A'
  }
}

function metricsHtml(metrics: ReportMetric[]): string {
  if (!metrics.length) return ''
  const cols = metrics.length <= 2 ? 2 : metrics.length === 3 ? 3 : 4
  return `<div class="kpi-grid cols-${cols}">
    ${metrics.map(m => {
      const accent = toneAccent(m.tone)
      const trend = m.trend ? `<span class="kpi-trend t-${m.trend.direction ?? 'neutral'}">${esc(m.trend.value)}${m.trend.label ? ` <span class="trend-label">${esc(m.trend.label)}</span>` : ''}</span>` : ''
      return `<div class="kpi-card">
        <div class="kpi-accent" style="background:${accent}"></div>
        <div class="kpi-label">${esc(m.label)}</div>
        <div class="kpi-value">${esc(m.value)}</div>
        ${m.sublabel ? `<div class="kpi-sub">${esc(m.sublabel)}</div>` : ''}
        ${trend}
      </div>`
    }).join('')}
  </div>`
}

// ---------------------------------------------------------------------------
// Tables HTML
// ---------------------------------------------------------------------------
function tableHtml(t: ReportTable): string {
  const rows = t.rows ?? []
  const cols = t.columns ?? []
  if (!cols.length) return ''
  if (!rows.length) {
    return `<div class="table-wrap">
      ${t.title ? `<div class="table-title">${esc(t.title)}</div>` : ''}
      ${t.subtitle ? `<div class="table-sub">${esc(t.subtitle)}</div>` : ''}
      <div class="empty-state">${esc(t.emptyMessage ?? 'No data available for the selected filters.')}</div>
    </div>`
  }
  return `<div class="table-wrap">
    ${t.title ? `<div class="table-title">${esc(t.title)}</div>` : ''}
    ${t.subtitle ? `<div class="table-sub">${esc(t.subtitle)}</div>` : ''}
    <table class="report-table">
      <thead><tr>${cols.map(c => `<th class="a-${c.align ?? 'left'}">${esc(c.header)}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map(r => `<tr>${cols.map(c => `<td class="a-${c.align ?? 'left'}">${fmtCell(r[c.key], c.format)}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
    <div class="table-foot">${rows.length} ${rows.length === 1 ? 'record' : 'records'}${t.title ? ` • ${esc(t.title)}` : ''}</div>
  </div>`
}

// ---------------------------------------------------------------------------
// Charts — static, print-safe (no JS)
// ---------------------------------------------------------------------------
function chartHtml(c: ReportChart): string {
  if (!c.data?.length || !c.series?.length) {
    return `<div class="chart-card"><div class="chart-title">${esc(c.title)}</div><div class="empty-state small">No chart data.</div></div>`
  }
  const maxVal = Math.max(1, ...c.data.flatMap(d => c.series.map(s => Number(d[s.key]) || 0)))
  const colors = ['#0F1D3A', '#7C3AED', '#06B6D4', '#F59E0B', '#10B981', '#EF4444']
  // Simple bar variant — most readable in PDF
  if (c.type === 'bar' || c.type === 'progress') {
    const bars = c.data.slice(0, 20).map(row => {
      const label = String(row[c.xKey] ?? '')
      const segs = c.series.map((s, i) => {
        const v = Number(row[s.key]) || 0
        const w = Math.round((v / maxVal) * 100)
        const col = s.color ?? colors[i % colors.length]
        return `<div class="bar-seg" style="width:${w}% ; background:${col}" title="${esc(s.label)}: ${v}"></div>`
      }).join('')
      return `<div class="bar-row"><div class="bar-label" title="${esc(label)}">${esc(label.slice(0,22))}</div><div class="bar-track">${segs}</div><div class="bar-val">${esc(String(c.data[0] ? Number(row[c.series[0].key]) || 0 : ''))}</div></div>`
    }).join('')
    const legend = `<div class="chart-legend">${c.series.map((s,i) => `<span><i style="background:${s.color ?? colors[i%colors.length]}"></i>${esc(s.label)}</span>`).join('')}</div>`
    return `<div class="chart-card"><div class="chart-title">${esc(c.title)}</div>${c.subtitle ? `<div class="chart-sub">${esc(c.subtitle)}</div>` : ''}${legend}<div class="bar-chart">${bars}</div></div>`
  }
  if (c.type === 'donut' || c.type === 'pie') {
    const total = c.data.reduce((a, d) => a + (Number(d[c.series[0].key]) || 0), 0) || 1
    const slices = c.data.slice(0, 8).map((row, i) => {
      const v = Number(row[c.series[0].key]) || 0
      const pct = (v / total) * 100
      const col = colors[i % colors.length]
      const seg = `<div class="pie-row"><span class="pie-dot" style="background:${col}"></span><span class="pie-label">${esc(String(row[c.xKey]))}</span><span class="pie-val">${pct.toFixed(1)}%</span></div>`
      return seg
    }).join('')
    return `<div class="chart-card"><div class="chart-title">${esc(c.title)}</div>${c.subtitle ? `<div class="chart-sub">${esc(c.subtitle)}</div>` : ''}<div class="pie-list">${slices}</div></div>`
  }
  // line/area — render as bar fallback with trend intent
  const points = c.data.slice(0, 16).map(r => Number(r[c.series[0].key]) || 0)
  const sparkMax = Math.max(1, ...points)
  const spark = points.map(v => {
    const h = Math.max(4, Math.round((v / sparkMax) * 48))
    return `<div class="spark-bar" style="height:${h}px"></div>`
  }).join('')
  return `<div class="chart-card"><div class="chart-title">${esc(c.title)}</div>${c.subtitle ? `<div class="chart-sub">${esc(c.subtitle)}</div>` : ''}<div class="spark-row">${spark}</div><div class="chart-legend"><span>${esc(c.series[0].label)}</span></div></div>`
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------
function insightsHtml(insights: ReportInsight[]): string {
  if (!insights.length) return ''
  return `<div class="insights">
    ${insights.map(ins => {
      const tone = ins.variant ?? 'info'
      return `<div class="insight-card v-${tone}">
        <div class="insight-title">${inlineMd(ins.title)}</div>
        <div class="insight-desc">${inlineMd(ins.description)}</div>
      </div>`
    }).join('')}
  </div>`
}

function inlineMd(s: string): string {
  // Escape first, then restore markdown inline elements
  let html = esc(s)
  // inline code `...`
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  // bold **...**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // italic *...* (single, not **) and _..._
  html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
  html = html.replace(/(?<!_)__([^_\n]+)__(?!_)/g, '<strong>$1</strong>')
  html = html.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '<em>$1</em>')
  // links [text](url) — text already escaped, url is plain
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  return html
}

function isTableSep(line: string): boolean {
  const t = line.trim()
  // markdown separator: | --- | :---: | etc. or --- | --- 
  if (!t.includes('-') && !t.includes(':')) return false
  return /^\|?[\s|:\-]+\|?[\s|:\-]*$/.test(t) && /---/.test(t)
}

function parseMdTable(headerLine: string, sepLine: string, bodyLines: string[]): string {
  const splitRow = (l: string) =>
    l
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim())
  const headers = splitRow(headerLine)
  const aligns: Array<'left' | 'center' | 'right'> = splitRow(sepLine).map((c) => {
    const t = c.trim()
    if (t.startsWith(':') && t.endsWith(':')) return 'center'
    if (t.endsWith(':')) return 'right'
    return 'left'
  })
  const rows: string[][] = []
  for (const l of bodyLines) {
    if (!l.trim() || !l.includes('|')) break
    if (isTableSep(l)) continue
    const cells = splitRow(l)
    while (cells.length < headers.length) cells.push('')
    rows.push(cells.slice(0, headers.length))
  }
  const headHtml = `<thead><tr>${headers.map((h, i) => `<th class="a-${aligns[i] ?? 'left'}">${inlineMd(h)}</th>`).join('')}</tr></thead>`
  const bodyHtml = `<tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="a-${aligns[i] ?? 'left'}">${inlineMd(c)}</td>`).join('')}</tr>`).join('')}</tbody>`
  return `<div class="md-table-wrap"><table class="report-table md-table">${headHtml}${bodyHtml}</table></div>`
}

function textHtml(text: string): string {
  if (!text.trim()) return ''
  const lines = text.split('\n')
  let out = '<div class="text-block">'
  let inList: 'ul' | 'ol' | null = null

  const closeList = () => {
    if (inList) { out += inList === 'ul' ? '</ul>' : '</ol>'; inList = null }
  }

  let i = 0
  while (i < lines.length) {
    const raw = lines[i]
    const line = raw.trim()

    if (!line) { closeList(); i++; continue }

    // heading: # .. ###### 
    const hm = line.match(/^(#{1,6})\s+(.*)$/)
    if (hm) {
      closeList()
      const level = hm[1].length
      const content = inlineMd(hm[2].trim())
      if (level <= 2) out += `<h2 class="md-h2">${content}</h2>`
      else if (level === 3) out += `<h3 class="md-h3">${content}</h3>`
      else out += `<h4 class="md-h4">${content}</h4>`
      i++; continue
    }

    // horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      closeList()
      out += '<hr class="md-hr" />'
      i++; continue
    }

    // blockquote — consume consecutive > lines
    if (line.startsWith('>')) {
      closeList()
      const bqLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        bqLines.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      out += `<blockquote>${inlineMd(bqLines.join(' '))}</blockquote>`
      continue
    }

    // markdown pipe table: header + separator + rows
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      closeList()
      const header = line
      const sep = lines[i + 1]
      const body: string[] = []
      let j = i + 2
      while (j < lines.length) {
        const bl = lines[j].trim()
        if (!bl || !bl.includes('|')) break
        // stop if next block is a heading/list/hr rather than table row — but pipe tables already gated
        body.push(lines[j])
        j++
      }
      out += parseMdTable(header, sep, body)
      i = j
      continue
    }

    // ordered list: 1. item
    const om = line.match(/^(\d+)\.\s+(.*)$/)
    if (om) {
      if (inList !== 'ol') { closeList(); out += '<ol>'; inList = 'ol' }
      out += `<li>${inlineMd(om[2])}</li>`
      i++; continue
    }

    // unordered list: -  *  +  • 
    const um = line.match(/^[-*+•]\s+(.*)$/)
    if (um) {
      if (inList !== 'ul') { closeList(); out += '<ul>'; inList = 'ul' }
      out += `<li>${inlineMd(um[1])}</li>`
      i++; continue
    }

    // normal paragraph — close any open list first
    closeList()
    out += `<p>${inlineMd(line)}</p>`
    i++
  }

  closeList()
  out += '</div>'
  return out
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------
export function buildReportHtml(input: UniversalReportDefinition): { html: string; landscape: boolean } {
  const def = normalizeReport(input)
  const landscape = shouldLandscape(def)
  const generatedAt = def.metadata?.generatedAt ?? new Date().toISOString()
  const genDate = new Date(generatedAt)
  const dateLabel = genDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  const timeLabel = genDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  const title = def.title ?? def.name
  const subtitle = def.subtitle ?? def.periodLabel ?? ''
  const orgName = def.metadata?.organizationName ?? 'Kawman ExAct'

  // Collect top-level fallback table from columns/rows if no tables/sections
  const topTables: ReportTable[] = [...(def.tables ?? [])]
  if (!topTables.length && def.columns?.length && def.rows?.length) {
    topTables.push({ columns: def.columns, rows: def.rows })
  }

  const hasAnyContent =
    (def.metrics?.length ?? 0) > 0 ||
    (def.charts?.length ?? 0) > 0 ||
    topTables.length > 0 ||
    (def.insights?.length ?? 0) > 0 ||
    (def.highlights?.length ?? 0) > 0 ||
    (def.sections?.length ?? 0) > 0

  const filterChips = def.filters && Object.keys(def.filters).length
    ? `<div class="filter-row">${Object.entries(def.filters).map(([k,v]) => `<span class="filter-chip"><span class="fc-label">${esc(k)}</span><span class="fc-val">${esc(v)}</span></span>`).join('')}</div>`
    : ''

  const metaExtra = def.metadata?.extra ? Object.entries(def.metadata.extra).map(([k,v]) => `<span class="meta-item"><span class="meta-k">${esc(k)}</span> ${esc(v)}</span>`).join('') : ''
  const metaLine = `<div class="meta-strip">
    <span class="meta-item"><span class="meta-k">Generated</span> ${esc(dateLabel)} · ${esc(timeLabel)}</span>
    ${def.metadata?.generatedBy ? `<span class="meta-item"><span class="meta-k">By</span> ${esc(def.metadata.generatedBy)}</span>` : ''}
    ${def.metadata?.recordCount != null ? `<span class="meta-item"><span class="meta-k">Records</span> ${esc(String(def.metadata.recordCount))}</span>` : ''}
    ${def.metadata?.dateRange ? `<span class="meta-item"><span class="meta-k">Period</span> ${esc(def.metadata.dateRange)}</span>` : ''}
    ${metaExtra}
    <span class="meta-item muted">Org-scoped • permission-aware</span>
  </div>`

  let body = ''

  if (!hasAnyContent) {
    body = `<div class="empty-state large">No data available for the selected filters.</div>`
  } else {
    if (def.metrics?.length) body += metricsHtml(def.metrics)
    if (def.insights?.length) body += insightsHtml(def.insights)
    if (def.highlights?.length) body += insightsHtml(def.highlights)
    if (def.charts?.length) body += `<div class="charts-grid cols-${Math.min(2, def.charts.length)}">${def.charts.map(chartHtml).join('')}</div>`
    for (const t of topTables) body += tableHtml(t)
    if (def.sections?.length) {
      for (const sec of def.sections) {
        body += `<section class="report-section">
          <div class="section-head">
            <h2>${esc(sec.title)}</h2>
            ${sec.description ? `<p class="section-desc">${esc(sec.description)}</p>` : ''}
          </div>
          ${sec.metrics?.length ? metricsHtml(sec.metrics) : ''}
          ${sec.text ? textHtml(sec.text) : ''}
          ${sec.insights?.length ? insightsHtml(sec.insights) : ''}
          ${sec.charts?.length ? `<div class="charts-grid cols-${Math.min(2, sec.charts.length)}">${sec.charts.map(chartHtml).join('')}</div>` : ''}
          ${(sec.tables ?? []).map(tableHtml).join('')}
        </section>`
      }
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 14mm 10mm 16mm 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #0f172a; font-family: 'Geist Sans', Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 10pt; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { max-width: 210mm; margin: 0 auto; padding: 0; }
  /* Header */
  .accent-bar { height: 4px; background: linear-gradient(90deg, #0F1D3A 0%, #7C3AED 55%, #06B6D4 100%); }
  .header { padding: 18px 0 12px; border-bottom: 1px solid #e2e8f0; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand-mark { width: 40px; height: 40px; border-radius: 10px; background: #0F1D3A; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; letter-spacing: 0.04em; }
  .brand-text .eyebrow { font-size: 8px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #64748b; }
  .brand-text .org { font-size: 12px; font-weight: 700; color: #0F1D3A; margin-top: 1px; }
  .title-block { margin-top: 14px; }
  .title-block h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; color: #0F1D3A; line-height: 1.15; }
  .title-block .subtitle { margin: 4px 0 0; font-size: 11px; color: #475569; }
  .filter-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .filter-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 999px; padding: 4px 10px; font-size: 8.5px; }
  .filter-chip .fc-label { font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.06em; }
  .filter-chip .fc-val { color: #0f172a; }
  .meta-strip { display: flex; flex-wrap: wrap; gap: 8px 14px; margin-top: 10px; padding: 8px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 8.5px; color: #475569; }
  .meta-strip .meta-k { font-weight: 700; color: #334155; margin-right: 4px; }
  .meta-strip .muted { color: #94a3b8; }
  /* KPI */
  .kpi-grid { display: grid; gap: 10px; margin-top: 14px; }
  .kpi-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
  .kpi-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
  .kpi-grid.cols-4 { grid-template-columns: repeat(4, 1fr); }
  .kpi-card { position: relative; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 12px 10px; overflow: hidden; }
  .kpi-accent { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; }
  .kpi-label { font-size: 8px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; }
  .kpi-value { margin-top: 6px; font-size: 18px; font-weight: 800; color: #0F1D3A; letter-spacing: -0.02em; }
  .kpi-sub { margin-top: 2px; font-size: 8.5px; color: #64748b; }
  .kpi-trend { display: inline-flex; align-items: center; gap: 4px; margin-top: 6px; font-size: 8px; font-weight: 700; padding: 2px 6px; border-radius: 999px; border: 1px solid #e2e8f0; }
  .kpi-trend.t-up { color: #059669; background: #ecfdf5; border-color: #a7f3d0; }
  .kpi-trend.t-down { color: #dc2626; background: #fef2f2; border-color: #fecaca; }
  .kpi-trend.t-neutral { color: #475569; background: #f8fafc; }
  .trend-label { font-weight: 400; }
  /* Sections */
  .report-section { margin-top: 16px; padding-top: 12px; border-top: 1px solid #f1f5f9; break-inside: avoid; }
  .section-head h2 { margin: 0; font-size: 13px; font-weight: 800; color: #0F1D3A; }
  .section-head .section-desc { margin: 4px 0 0; font-size: 9px; color: #64748b; }
  /* Charts */
  .charts-grid { display: grid; gap: 10px; margin-top: 10px; }
  .charts-grid.cols-1 { grid-template-columns: 1fr; }
  .charts-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
  .chart-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; background: #fff; }
  .chart-title { font-size: 10px; font-weight: 700; color: #0F1D3A; }
  .chart-sub { font-size: 8.5px; color: #64748b; margin-top: 2px; }
  .chart-legend { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; font-size: 7.5px; color: #475569; }
  .chart-legend span { display: inline-flex; align-items: center; gap: 4px; }
  .chart-legend i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
  .bar-chart { margin-top: 8px; display: grid; gap: 6px; }
  .bar-row { display: grid; grid-template-columns: 110px 1fr 60px; gap: 8px; align-items: center; }
  .bar-label { font-size: 8px; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar-track { height: 10px; background: #f1f5f9; border-radius: 999px; overflow: hidden; display: flex; }
  .bar-seg { height: 100%; }
  .bar-val { font-size: 8px; font-weight: 700; color: #0F1D3A; text-align: right; }
  .pie-list { margin-top: 8px; display: grid; gap: 5px; }
  .pie-row { display: grid; grid-template-columns: 10px 1fr auto; gap: 8px; align-items: center; font-size: 8.5px; }
  .pie-dot { width: 8px; height: 8px; border-radius: 999px; }
  .spark-row { display: flex; align-items: flex-end; gap: 3px; height: 56px; margin-top: 10px; padding: 6px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
  .spark-bar { flex: 1; background: #0F1D3A; border-radius: 2px 2px 0 0; }
  /* Insights */
  .insights { display: grid; gap: 8px; margin-top: 10px; }
  .insight-card { border: 1px solid #e2e8f0; border-left-width: 3px; border-radius: 8px; padding: 10px 12px; background: #fff; }
  .insight-card.v-info { border-left-color: #2563eb; background: #eff6ff; }
  .insight-card.v-success { border-left-color: #059669; background: #ecfdf5; }
  .insight-card.v-warning { border-left-color: #d97706; background: #fffbeb; }
  .insight-card.v-danger { border-left-color: #dc2626; background: #fef2f2; }
  .insight-card.v-highlight { border-left-color: #7C3AED; background: #f5f3ff; }
  .insight-title { font-size: 9px; font-weight: 700; color: #0F1D3A; }
  .insight-desc { margin-top: 4px; font-size: 8.5px; color: #334155; line-height: 1.5; }
  /* Text */
  .text-block { margin-top: 10px; font-size: 9px; color: #334155; line-height: 1.6; }
  .text-block p { margin: 6px 0; }
  .text-block ul { margin: 6px 0 6px 14px; padding: 0; }
  .text-block ol { margin: 6px 0 6px 18px; padding: 0; }
  .text-block li { margin: 3px 0; }
  .text-block blockquote { margin: 8px 0; padding: 8px 12px; border-left: 3px solid #7C3AED; background: #f5f3ff; border-radius: 0 8px 8px 0; color: #4c1d95; }
  .text-block .md-h2 { margin: 14px 0 6px; font-size: 13px; font-weight: 800; color: #0F1D3A; letter-spacing: -0.01em; }
  .text-block .md-h3 { margin: 12px 0 4px; font-size: 11px; font-weight: 700; color: #0F1D3A; }
  .text-block .md-h4 { margin: 10px 0 4px; font-size: 10px; font-weight: 700; color: #334155; }
  .text-block .md-hr { margin: 10px 0; border: none; border-top: 1px solid #e2e8f0; }
  .text-block code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 8.5px; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; padding: 1px 4px; }
  .text-block a { color: #2563eb; text-decoration: underline; }
  .md-table-wrap { margin: 10px 0; overflow: hidden; border: 1px solid #e2e8f0; border-radius: 8px; }
  .md-table-wrap .report-table { margin: 0; }
  /* Tables */
  .table-wrap { margin-top: 12px; }
  .table-title { font-size: 11px; font-weight: 700; color: #0F1D3A; }
  .table-sub { font-size: 8.5px; color: #64748b; margin-top: 2px; margin-bottom: 6px; }
  .report-table { width: 100%; border-collapse: collapse; font-size: 8.5px; }
  .report-table thead th { background: #0F1D3A; color: #fff; font-weight: 700; font-size: 7.5px; letter-spacing: 0.06em; text-transform: uppercase; padding: 8px 8px; text-align: left; white-space: nowrap; }
  .report-table thead th.a-center { text-align: center; }
  .report-table thead th.a-right { text-align: right; }
  .report-table tbody td { padding: 7px 8px; border-bottom: 1px solid #e2e8f0; color: #1e293b; vertical-align: top; word-break: break-word; }
  .report-table tbody td.a-center { text-align: center; }
  .report-table tbody td.a-right { text-align: right; }
  .report-table tbody tr:nth-child(even) td { background: #f8fafc; }
  .report-table tbody tr:last-child td { border-bottom: 1px solid #cbd5e1; }
  .table-foot { margin-top: 6px; font-size: 7.5px; color: #94a3b8; }
  .empty-state { margin-top: 10px; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 18px; text-align: center; font-size: 9px; color: #64748b; background: #f8fafc; }
  .empty-state.small { padding: 12px; }
  .empty-state.large { padding: 28px; font-size: 10px; }
  /* Footer */
  .doc-footer { margin-top: 18px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; gap: 12px; font-size: 7.5px; color: #94a3b8; }
  /* Print */
  @media print {
    .page { max-width: none; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    .kpi-card, .chart-card, .insight-card, .table-wrap { break-inside: avoid; }
    .report-section { break-inside: auto; }
  }
</style>
</head>
<body>
  <div class="accent-bar"></div>
  <div class="page">
    <header class="header">
      <div class="brand">
        <div class="brand-mark">K</div>
        <div class="brand-text">
          <div class="eyebrow">Kawman ExAct — Enterprise Workspace</div>
          <div class="org">${esc(orgName)} • ${esc(title)}</div>
        </div>
      </div>
      <div class="title-block">
        <h1>${esc(title)}</h1>
        ${subtitle ? `<div class="subtitle">${esc(subtitle)}</div>` : ''}
      </div>
      ${filterChips}
      ${metaLine}
    </header>
    <main>
      ${body}
    </main>
    <footer class="doc-footer">
      <span>Kawman ExAct • ${esc(def.footerNote ?? 'Confidential — for authorized recipients only. Verify critical figures before sharing externally.')}</span>
      <span>${esc(dateLabel)} • Page <span class="page-num"></span></span>
    </footer>
  </div>
</body>
</html>`

  return { html, landscape }
}
