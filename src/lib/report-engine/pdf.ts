import 'server-only'

import { buildReportHtml } from './html-template'
import type { UniversalReportDefinition } from './types'

export interface PdfOptions {
  /** Override auto-detected orientation. When omitted, html-template decides (landscape if any table ≥7 cols). */
  landscape?: boolean
  /** Optional extra margin overrides (mm) */
  margin?: { top?: string; right?: string; bottom?: string; left?: string }
}

// Singleton browser — reused across requests in the same server process.
// In serverless (Vercel) this still helps within a warm container.
let browserPromise: Promise<import('puppeteer').Browser> | null = null

async function getBrowser(): Promise<import('puppeteer').Browser> {
  if (browserPromise) return browserPromise
  // Dynamic import so `next build` doesn't fail when puppeteer isn't installed yet.
  // The task explicitly states puppeteer will be installed later.
  let puppeteer: typeof import('puppeteer')
  try {
    puppeteer = await import('puppeteer')
  } catch {
    throw new Error(
      'puppeteer is not installed. Run `npm install puppeteer` (or `puppeteer-core` + browser) to enable PDF export.',
    )
  }
  browserPromise = puppeteer
    .launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--font-render-hinting=none',
      ],
    })
    .catch((err: unknown) => {
      // Launch failed (e.g. Chrome not installed) — don't poison the singleton
      browserPromise = null
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Could not find Chrome')) {
        throw new Error(
          'Chrome for Puppeteer is not installed. Run `npx puppeteer browsers install chrome` once locally, ' +
            'or add it to your build (e.g. `npx puppeteer browsers install chrome` in postinstall). Original: ' +
            msg,
        )
      }
      throw err
    })
  let b: import('puppeteer').Browser
  try {
    b = await browserPromise
  } catch (e) {
    browserPromise = null
    throw e
  }
  // Best-effort cleanup on process exit (no-op in serverless, useful locally)
  const cleanup = async (): Promise<void> => {
    try {
      const br = await browserPromise
      await br?.close()
    } catch {
      // ignore
    }
  }
  process.on('exit', () => void cleanup())
  process.on('SIGTERM', () => void cleanup())
  return b
}

/**
 * Render a UniversalReportDefinition to PDF.
 * - Builds HTML via buildReportHtml (Kawman ExAct premium design, paginated, print-safe)
 * - Launches puppeteer with --no-sandbox --disable-setuid-sandbox
 * - Sets HTML with waitUntil networkidle0, waits for document.fonts.ready (₹ glyphs, Geist)
 * - Calls page.pdf with A4, landscape auto-detection, printBackground, and real page numbers
 * - Returns a Node Buffer (suitable for NextResponse / file download)
 *
 * Large datasets: HTML uses CSS `thead { display: table-header-group }`, `break-inside: avoid`
 * and puppeteer's native pagination. Tables with many rows flow across pages automatically.
 */
export async function generateReportPdfBuffer(
  report: UniversalReportDefinition,
  opts?: PdfOptions,
): Promise<{ buffer: Buffer; landscape: boolean }> {
  const { html, landscape: autoLandscape } = buildReportHtml(report)
  const landscape = opts?.landscape ?? autoLandscape

  const browser = await getBrowser()
  const page = await browser.newPage()

  try {
    // Emulate print media so @page / @media print rules apply
    await page.emulateMediaType('print')

    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    // Wait for network idle separately (more compatible with older puppeteer types)
    await page.waitForNetworkIdle({ idleTime: 300, timeout: 5000 }).catch(() => {})

    // Ensure web fonts are fully loaded before printing — avoids missing ₹ glyphs
    // and layout shift after font swap.
    try {
      await page.evaluateHandle('document.fonts.ready')
      // evaluateHandle returns a JSHandle; await it to settle.
      await page.evaluate(() => document.fonts.ready)
    } catch {
      // Fonts API may not be available in some Chromium builds — non-fatal
    }

    // Small settle delay for layout / bar widths to finalize
    await new Promise<void>((resolve) => setTimeout(resolve, 200))

    const margin = {
      top: opts?.margin?.top ?? '12mm',
      right: opts?.margin?.right ?? '10mm',
      bottom: opts?.margin?.bottom ?? '14mm',
      left: opts?.margin?.left ?? '10mm',
    }

    // Real page numbers via Puppeteer's header/footer templating.
    // displayHeaderFooter requires non-empty templates; use empty header + styled footer.
    const footerTemplate = `
      <div style="width:100%;font-size:7px;color:#94a3b8;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;display:flex;justify-content:space-between;align-items:center;padding:0 10mm;box-sizing:border-box;">
        <span>Kawman ExAct &bull; Confidential &mdash; verify critical figures before sharing externally</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>
    `
    const headerTemplate = '<span></span>'

    const pdf = await page.pdf({
      format: 'A4',
      landscape,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      margin,
      preferCSSPageSize: true,
    })

    return { buffer: Buffer.from(pdf), landscape }
  } finally {
    await page.close().catch(() => {})
  }
}

/** Convenience: HTML only (for print preview / `window.print()` flow) */
export function generateReportHtml(
  report: UniversalReportDefinition,
): { html: string; landscape: boolean } {
  return buildReportHtml(report)
}

/** For tests / graceful shutdown */
export async function closePdfBrowser(): Promise<void> {
  if (!browserPromise) return
  try {
    const b = await browserPromise
    await b.close()
  } catch {
    // ignore
  } finally {
    browserPromise = null
  }
}
