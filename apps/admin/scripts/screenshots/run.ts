/**
 * Capture the specs in screenshots/specs.ts. Writes PNGs under
 * docs/assets/screenshots/ (a spec name with a `/` writes into a subfolder).
 *
 * Usage:
 *   pnpm docs:screenshots                          # every spec
 *   pnpm docs:screenshots --only admin/status,admin-sidebar
 *   pnpm docs:screenshots:clean                    # remove the seeded fixtures
 *
 * Assumes the docker stack is up (admin :3000, admin-api :3001,
 * integration-server :3010). Override the URLs via env:
 *   ADMIN_URL, ADMIN_API_URL, INTEGRATION_URL
 *
 * Login: ADMIN_USER + ADMIN_USER_PASSWORD (ADMIN_PASS is accepted as a
 * fallback), from the shell environment or else the repo root `.env` — the
 * compose deployment's own login. From a git worktree with no `.env`, the
 * lookup walks up to the main checkout's; `ENV_FILE=/path/to/.env` points it
 * anywhere else. The values are typed into the login form and sent to the
 * admin-api login endpoint, and nowhere else. See seed.ts `adminCredentials`.
 *
 * Idempotent: seed runs before capture and reuses existing fixtures, so a
 * re-run after an admin UI change just refreshes the PNGs.
 *
 * Every capture redacts anything that looks like a credential before the
 * shutter (see REDACT_PATTERNS), in addition to each spec's own `redact`
 * selectors: the value is overwritten in the page with bullets, then blurred.
 */
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { adminCredentials, seedFixtures, type SeededFixtures } from './seed'
import { DEFAULT_VIEWPORT, SCREENSHOT_SPECS, type ScreenshotSpec } from './specs'

const ADMIN_URL = process.env['ADMIN_URL'] ?? 'http://localhost:3000'
const INTEGRATION_URL = process.env['INTEGRATION_URL'] ?? 'http://localhost:3010'
const OUT_DIR = path.resolve(__dirname, '../../../../docs/assets/screenshots')

/**
 * Text that must never be legible in a committed screenshot, whatever page
 * it turns up on. Matched against text nodes and input values; the smallest
 * enclosing element is redacted. Deliberately broad: a false positive costs a
 * hidden id, a false negative publishes a credential.
 */
const REDACT_PATTERNS: string[] = [
  // 48+ hex chars: connect-link tokens and webhook secrets are 64.
  '\\b[0-9a-f]{48,}\\b',
  // Full developer / end-user / SCIM keys (the short display prefixes,
  // e.g. `osk_default_…`, stay readable).
  '\\b(?:osk|eut|scim)_[A-Za-z0-9_-]{24,}',
  // Incoming-webhook URLs are bearer credentials.
  'hooks\\.slack\\.com/(?:services|workflows|triggers)/',
  'webhook\\.office\\.com/',
  'logic\\.azure\\.com[^\\s]*sig=',
  // A connect-link URL carries its token in the path.
  '/connect/[A-Za-z0-9_-]{20,}',
  // JWTs.
  '\\beyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}',
]

const REDACT_STYLE_ID = 'docs-screenshot-redact'

interface Args {
  only: Set<string> | null
}

function parseArgs(argv: string[]): Args {
  let only: Set<string> | null = null
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    let value: string | undefined
    if (arg === '--only') value = argv[++i]
    else if (arg.startsWith('--only=')) value = arg.slice('--only='.length)
    else if (arg === '--') continue
    else throw new Error(`unknown argument: ${arg} (supported: --only <name,…>)`)
    if (!value) throw new Error('--only needs a comma-separated list of spec names')
    only ??= new Set()
    for (const name of value.split(',')) if (name.trim()) only.add(name.trim())
  }
  return { only }
}

function pageHelpers(page: Page) {
  return {
    click: (selector: string) => page.click(selector),
    fill: (selector: string, value: string) => page.fill(selector, value),
    hover: (selector: string) => page.hover(selector),
    evaluate: (fn: () => unknown) => page.evaluate(fn),
    waitForSelector: (selector: string, opts?: { timeout?: number }) =>
      page.waitForSelector(selector, opts).then(() => undefined),
    waitForTimeout: (ms: number) => page.waitForTimeout(ms),
    scrollTo: async (selector: string, opts?: { text?: string; offset?: number }) => {
      const found = await page.evaluate(
        ({ selector, text, offset }) => {
          const el = Array.from(document.querySelectorAll(selector)).find(
            (e) => text === undefined || e.textContent?.trim() === text,
          )
          if (!el) return false
          // The admin header is sticky: land below it, not underneath it.
          const header = document.querySelector('.app-header')
          const headerHeight = header ? header.getBoundingClientRect().height : 0
          const top = el.getBoundingClientRect().top + window.scrollY - headerHeight - offset
          window.scrollTo({ top: Math.max(0, top), behavior: 'instant' as ScrollBehavior })
          return true
        },
        { selector, text: opts?.text, offset: opts?.offset ?? 24 },
      )
      if (!found)
        console.warn(
          `   scrollTo: nothing matched ${selector}${opts?.text ? ` "${opts.text}"` : ''}`,
        )
      await page.waitForTimeout(150)
    },
    fillIfEmpty: async (selector: string, value: string) => {
      const current = await page.inputValue(selector).catch(() => null)
      if (current === '') await page.fill(selector, value)
    },
    setValue: async (selector: string, value: string) => {
      await page.evaluate(
        ({ selector, value }) => {
          const el = document.querySelector(selector) as HTMLInputElement | null
          if (el) el.value = value
        },
        { selector, value },
      )
    },
  }
}

async function loginAdmin(page: Page): Promise<void> {
  const { user, password } = adminCredentials()
  await page.goto(`${ADMIN_URL}/login`, { waitUntil: 'domcontentloaded' })
  // Scope to the local-account form: with SSO configured, an LDAP provider's
  // form (also username/password) renders first.
  const form = 'form[action="/login"]'
  await page.fill(`${form} input[name="username"]`, user)
  await page.fill(`${form} input[name="password"]`, password)
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 }),
    page.click(`${form} button[type="submit"]`),
  ]).catch(() => {
    throw new Error('admin login failed — check ADMIN_USER / ADMIN_USER_PASSWORD')
  })
}

/**
 * Blur the spec's selectors plus every element whose text (or input value)
 * matches REDACT_PATTERNS. Returns how many elements the patterns caught, so
 * the log shows when the safety net fired.
 */
async function applyRedaction(page: Page, selectors: string[]): Promise<number> {
  // Plain JS source rather than a TS closure: tsx (esbuild keepNames) wraps
  // named inner functions in a `__name()` helper that does not exist in the
  // page, so a closure with a local arrow function throws there.
  //
  // Blur alone is not redaction: a blurred string in a known font can be
  // brute-forced back. So every redacted value is first OVERWRITTEN in the
  // DOM with bullets of the same length, and only then blurred — the pixels
  // in the PNG never derive from the secret at all.
  const args = JSON.stringify({ selectors, patterns: REDACT_PATTERNS, styleId: REDACT_STYLE_ID })
  return page.evaluate<number>(`(function (a) {
    var res = a.patterns.map(function (p) { return new RegExp(p) })
    function hit(s) { return !!s && res.some(function (r) { return r.test(s) }) }
    function mask(s) { return s.replace(/\\S/g, '\\u2022') }
    function scrub(el) {
      if (el.matches('input, textarea, select')) {
        if ('value' in el && typeof el.value === 'string' && el.tagName !== 'SELECT') el.value = mask(el.value)
      } else {
        var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        for (var t = w.nextNode(); t; t = w.nextNode()) t.textContent = mask(t.textContent || '')
      }
      el.setAttribute('data-shot-redact', '')
    }
    var caught = 0
    var hits = []
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (var n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.parentElement && n.parentElement.closest('script, style')) continue
      if (hit(n.textContent) && n.parentElement) hits.push(n.parentElement)
    }
    document.querySelectorAll('input, textarea').forEach(function (el) {
      if (hit(el.value)) hits.push(el)
    })
    hits.forEach(function (el) { scrub(el); caught++ })
    a.selectors.forEach(function (sel) { document.querySelectorAll(sel).forEach(scrub) })
    document.querySelectorAll('[data-shot-redact]').forEach(scrub)
    var old = document.getElementById(a.styleId)
    if (old) old.remove()
    var style = document.createElement('style')
    style.id = a.styleId
    style.textContent = '[data-shot-redact] { filter: blur(5px) !important; user-select: none !important; }'
    document.head.appendChild(style)
    return caught
  })(${args})`)
}

function outputFiles(spec: ScreenshotSpec): Array<{ theme: 'light' | 'dark'; file: string }> {
  const base = spec.output ?? spec.name
  switch (spec.theme ?? 'light') {
    case 'both':
      return [
        { theme: 'light', file: `${base}-light.png` },
        { theme: 'dark', file: `${base}-dark.png` },
      ]
    case 'dark':
      return [{ theme: 'dark', file: `${base}.png` }]
    default:
      return [{ theme: 'light', file: `${base}.png` }]
  }
}

async function capture(
  spec: ScreenshotSpec,
  page: Page,
  file: string,
  seed: SeededFixtures,
): Promise<void> {
  const target = typeof spec.url === 'function' ? spec.url(seed) : spec.url
  if (target === null) {
    throw new Error('no target: the stack has nothing for this page (see the seed log)')
  }
  const base = spec.anonymous ? INTEGRATION_URL : ADMIN_URL
  await page.setViewportSize(spec.viewport ?? DEFAULT_VIEWPORT)

  const response = await page.goto(`${base}${target}`, { waitUntil: 'domcontentloaded' })
  if (response && response.status() >= 400) {
    throw new Error(`${target} answered ${response.status()}`)
  }
  if (spec.waitFor) {
    try {
      await page.waitForSelector(spec.waitFor, { timeout: 10_000 })
    } catch {
      console.warn(`   waitFor "${spec.waitFor}" timed out — continuing anyway`)
    }
  }
  // Let client-side rendering (charts, lazy tables) finish. Pages that poll
  // never go fully idle, so this is capped rather than awaited outright.
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined)
  await page.waitForTimeout(spec.settle ?? 300)

  if (spec.beforeShot) await spec.beforeShot(pageHelpers(page))
  // No focus ring on whatever a beforeShot last filled.
  await page.evaluate(
    'document.activeElement && document.activeElement.blur && document.activeElement.blur()',
  )
  // Screenshots show the console, not the license state of the stack that took
  // them (a compose stack without a license is MISSING): drop the admin banner.
  // String form, like applyRedaction: tsx's __name helper breaks closures here.
  await page.evaluate(
    "document.querySelectorAll('[data-license-banner]').forEach(function (e) { e.remove() })",
  )

  const caught = await applyRedaction(page, spec.redact ?? [])
  if (caught > 0) console.log(`   redacted ${caught} credential-shaped value(s)`)
  // Let the blur paint.
  await page.waitForTimeout(100)

  const outFile = path.join(OUT_DIR, file)
  mkdirSync(path.dirname(outFile), { recursive: true })
  if (spec.fullPage === 'element' && spec.clipSelector) {
    const handle = await page.$(spec.clipSelector)
    if (!handle) throw new Error(`clipSelector "${spec.clipSelector}" did not match anything`)
    await handle.screenshot({ path: outFile })
  } else if (spec.fullPage === true) {
    // Grow the viewport to the page instead of using Playwright's fullPage
    // stitch: the admin sidebar is sticky at viewport height, so a stitched
    // capture shows it stopping after the first screen.
    const height = await page.evaluate<number>('document.documentElement.scrollHeight')
    const width = (spec.viewport ?? DEFAULT_VIEWPORT).width
    await page.setViewportSize({ width, height: Math.min(height, 6000) })
    await page.waitForTimeout(200)
    await page.screenshot({ path: outFile, fullPage: true })
  } else {
    await page.screenshot({ path: outFile })
  }
  console.log(`✓ ${file}`)
}

async function newContext(
  browser: Browser,
  colorScheme: 'light' | 'dark',
): Promise<BrowserContext> {
  // A fresh context has no `os-theme` in localStorage, so the admin's
  // theme-init.js follows prefers-color-scheme — i.e. this colorScheme.
  return browser.newContext({ viewport: DEFAULT_VIEWPORT, colorScheme })
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  let specs = SCREENSHOT_SPECS.filter((s) => !s.skip)
  if (args.only) {
    const known = new Set(SCREENSHOT_SPECS.map((s) => s.name))
    const unknown = [...args.only].filter((n) => !known.has(n))
    if (unknown.length > 0) {
      throw new Error(
        `--only: no spec named ${unknown.join(', ')}. Known: ${[...known].join(', ')}`,
      )
    }
    specs = specs.filter((s) => args.only!.has(s.name))
  }

  // Resolve the login before anything else, so a missing one fails fast.
  adminCredentials()

  mkdirSync(OUT_DIR, { recursive: true })
  console.log(`[run] writing to ${OUT_DIR}`)

  // Health check the admin URL up front so a missing stack fails fast with
  // a useful message instead of Playwright timeouts.
  try {
    const res = await fetch(`${ADMIN_URL}/login`)
    if (!res.ok && res.status !== 302) throw new Error(`admin returned ${res.status}`)
  } catch (err) {
    console.error(`\n[run] cannot reach admin at ${ADMIN_URL}.`)
    console.error('       Start the stack first: docker compose up -d\n')
    throw err
  }

  const seed = await seedFixtures()

  const needs = new Set(specs.flatMap((s) => outputFiles(s).map((o) => o.theme)))
  const browser = await chromium.launch({ headless: true })
  const failures: string[] = []
  let captured = 0
  try {
    const pages: Partial<Record<'light' | 'dark', Page>> = {}
    for (const theme of ['light', 'dark'] as const) {
      if (!needs.has(theme)) continue
      const page = await (await newContext(browser, theme)).newPage()
      await loginAdmin(page)
      pages[theme] = page
    }
    const anonPage = await (await newContext(browser, 'light')).newPage()

    for (const spec of specs) {
      for (const { theme, file } of outputFiles(spec)) {
        const page = spec.anonymous ? anonPage : pages[theme]!
        try {
          await capture(spec, page, file, seed)
          captured++
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`✗ ${file}: ${msg}`)
          failures.push(`${file}: ${msg}`)
        }
      }
    }
  } finally {
    await browser.close()
  }

  const skipped = SCREENSHOT_SPECS.filter((s) => s.skip).length
  console.log(`\n[run] ${captured} captured, ${failures.length} failed, ${skipped} skipped`)
  if (failures.length > 0) {
    for (const f of failures) console.error(`  - ${f}`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('[run] failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
