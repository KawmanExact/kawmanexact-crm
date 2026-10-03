export interface AIChartSpec {
  title: string
  type: 'bar' | 'line' | 'pie'
  xKey: string
  yKeys: string[]
  data: Record<string, unknown>[]
}

function isNumericValue(v: unknown): boolean {
  if (v == null || v === '') return false
  const s = String(v).trim().replace(/[₹$€£,\s%]/g, '')
  if (!s) return false
  // allow currency, percent, commas already stripped
  return !isNaN(Number(s)) && isFinite(Number(s))
}

function toNumber(v: unknown): number | null {
  const s = String(v).trim().replace(/[₹$€£,\s%]/g, '')
  const n = Number(s)
  return isFinite(n) ? n : null
}

function isDateLike(s: string): boolean {
  const t = s.trim()
  if (!t) return false
  // ISO date, DD/MM/YYYY, MM/DD/YYYY, "Jan 12", etc.
  const d = Date.parse(t)
  if (isNaN(d)) return false
  // must look like a date (contain - or / or month name)
  return /[-/]/.test(t) || /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(t)
}

export function inferCharts(
  headers: string[],
  rows: Record<string, unknown>[],
  sheetName?: string
): AIChartSpec[] {
  if (!headers.length || !rows.length) return []
  const sample = rows.slice(0, 30)
  const numericCols: string[] = []
  const textCols: string[] = []
  const dateCols: string[] = []

  for (const h of headers) {
    let num = 0
    let dateLike = 0
    for (const r of sample) {
      const v = r[h]
      if (isNumericValue(v)) num++
      else if (typeof v === 'string' && isDateLike(v)) dateLike++
    }
    const ratio = num / Math.max(1, sample.length)
    if (ratio >= 0.6) numericCols.push(h)
    else if (dateLike / sample.length >= 0.5) dateCols.push(h)
    else textCols.push(h)
  }

  if (!numericCols.length) return []
  // pick category: prefer first text col, else first date col, else first non-numeric
  const categoryCol = textCols[0] ?? dateCols[0] ?? headers.find((h) => !numericCols.includes(h))
  if (!categoryCol) return []

  // Limit data for chart (top 20 rows, numeric sorted if one metric)
  const isDateCategory = dateCols.includes(categoryCol)
  const primaryY = numericCols[0]
  // Try to sort by numeric desc for bar, or by date for line
  let chartData = [...rows]
  if (isDateCategory) {
    chartData.sort((a, b) => {
      const da = Date.parse(String(a[categoryCol] ?? ''))
      const db = Date.parse(String(b[categoryCol] ?? ''))
      if (isNaN(da) || isNaN(db)) return 0
      return da - db
    })
  } else if (numericCols.length === 1) {
    // top N by value for readability
    chartData.sort((a, b) => (toNumber(b[primaryY]) ?? 0) - (toNumber(a[primaryY]) ?? 0))
  }
  chartData = chartData.slice(0, 20).map((r) => {
    const o: Record<string, unknown> = {}
    o[categoryCol] = String(r[categoryCol] ?? '').slice(0, 28)
    for (const y of numericCols.slice(0, 3)) {
      const n = toNumber(r[y])
      o[y] = n ?? 0
    }
    return o
  })

  const charts: AIChartSpec[] = []
  const titleBase = sheetName ? sheetName.replace(/[_-]/g, ' ').trim() : headers.slice(0, 2).join(' × ')

  if (isDateCategory) {
    charts.push({
      title: `${titleBase} — Trend`,
      type: 'line',
      xKey: categoryCol,
      yKeys: numericCols.slice(0, 3),
      data: chartData,
    })
  } else {
    // Bar is the safest default; if few rows and single metric, also offer pie as second chart
    charts.push({
      title: titleBase || 'Distribution',
      type: 'bar',
      xKey: categoryCol,
      yKeys: numericCols.slice(0, 3),
      data: chartData,
    })
    if (numericCols.length === 1 && chartData.length >= 2 && chartData.length <= 8) {
      charts.push({
        title: `${titleBase} — Share`,
        type: 'pie',
        xKey: categoryCol,
        yKeys: [primaryY],
        data: chartData,
      })
    }
  }

  // Cap to 2 charts for UI
  return charts.slice(0, 2)
}
