#!/usr/bin/env node
/**
 * Guarded postinstall: download Chrome for Puppeteer — but only where it's
 * actually needed and where it can succeed.
 *
 * Why this exists: the previous unconditional
 *   "postinstall": "puppeteer browsers install chrome"
 * ran on EVERY install, including Vercel builds and locked-down sandboxes.
 * That pulls a ~150MB browser, needs network access, and fails the whole
 * install when it can't write to the cache dir — breaking deploys that
 * never launch a browser (this app doesn't import puppeteer anywhere; it's
 * only a test-tooling dependency).
 *
 * Opt in explicitly with PUPPETEER_SKIP_DOWNLOAD unset, or force the download
 * in a detected CI/sandbox environment with `npm run setup:chrome`.
 */
const FORCE = process.env.FORCE_PUPPETEER_DOWNLOAD === '1'

// Environments where a browser download is unwanted or likely to fail.
const SKIP = [
  ['VERCEL', process.env.VERCEL], // Vercel build containers
  ['CI', process.env.CI], // generic CI (GitHub Actions, etc.)
  ['CONTINUOUS_INTEGRATION', process.env.CONTINUOUS_INTEGRATION],
  ['NETLIFY', process.env.NETLIFY],
  ['RENDER', process.env.RENDER],
  ['FLY_APP_NAME', process.env.FLY_APP_NAME],
  ['AWS_LAMBDA_FUNCTION_NAME', process.env.AWS_LAMBDA_FUNCTION_NAME],
].filter(([, value]) => Boolean(value))

if (SKIP.length > 0) {
  console.log(
    `[postinstall] Skipping Puppeteer Chrome download (detected: ${SKIP.map(([k]) => k).join(', ')}). ` +
      'Run `npm run setup:chrome` locally if a test needs a browser.'
  )
  process.exit(0)
}

if (!FORCE && process.env.PUPPETEER_SKIP_DOWNLOAD === 'true') {
  console.log('[postinstall] Skipping Puppeteer Chrome download (PUPPETEER_SKIP_DOWNLOAD=true).')
  process.exit(0)
}

try {
  const { execFileSync } = await import('node:child_process')
  // Resolve the local puppeteer CLI so we don't depend on a global install.
  const cli = new URL('../node_modules/puppeteer/lib/puppeteer/node/cli.js', import.meta.url)
  execFileSync(process.execPath, [cli.pathname, 'browsers', 'install', 'chrome'], { stdio: 'inherit' })
} catch (err) {
  // Never fail the install over an optional test browser. Log loudly and move on.
  console.warn(
    `[postinstall] Puppeteer Chrome download failed, continuing anyway: ${
      err instanceof Error ? err.message : String(err)
    }`
  )
  process.exit(0)
}
