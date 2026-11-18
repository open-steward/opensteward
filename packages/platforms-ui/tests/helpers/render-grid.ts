/**
 * Shared harness for exercising `cardFor` — the per-platform card that the
 * client-side script embedded by `renderPlatformsBody()` builds in the browser
 * (packages/platforms-ui/src/index.ts).
 *
 * That script is hand-authored JS text, not a compiled TypeScript export, so
 * this runs the *real* generated script rather than a parallel reimplementation
 * of it: `renderPlatformsBody()`'s `<script>` body is extracted and run against
 * a minimal `document`/`fetch` stub, and the resulting `#grid` markup is what
 * callers assert on — exactly what a browser would show.
 *
 * No DOM library is needed: with the default `logoSource: 'none'`, `cardFor`
 * never touches a live DOM node — only the script's setup code does
 * (`document.getElementById`/`createElement` for the vertical-filter pills),
 * which the stub below covers.
 */
import { renderPlatformsBody, type PlatformEntry } from '../../src/index.js'

function extractScript(html: string): string {
  const m = html.match(/<script>([\s\S]*)<\/script>\s*$/)
  if (!m) throw new Error('renderPlatformsBody() output has no trailing <script> tag')
  return m[1]
}

/**
 * Just enough element surface for the script's setup code (attributes,
 * classList, event registration, child tracking). None of it is exercised by
 * `cardFor` itself — see the file header.
 */
interface StubElement {
  children: StubElement[]
  innerHTML: string
  textContent: string
  onclick: (() => void) | null
  getAttribute(k: string): string | null
  hasAttribute(k: string): boolean
}

function stubElement() {
  const attrs = new Map<string, string>()
  const children: StubElement[] = []
  return {
    children,
    innerHTML: '',
    textContent: '',
    hidden: false,
    className: '',
    type: '',
    onclick: null as (() => void) | null,
    setAttribute(k: string, v: string) {
      attrs.set(k, String(v))
    },
    getAttribute(k: string) {
      return attrs.has(k) ? attrs.get(k)! : null
    },
    hasAttribute(k: string) {
      return attrs.has(k)
    },
    removeAttribute(k: string) {
      attrs.delete(k)
    },
    classList: { add() {}, remove() {}, contains: () => false },
    addEventListener() {},
    appendChild(child: StubElement) {
      children.push(child)
    },
    // Only the selectors the script uses: `[data-vertical]` and
    // `[data-status]` (render() syncing aria-pressed) and `.segmented__btn`
    // (arrow-key roving).
    querySelectorAll(sel: string) {
      if (sel === '[data-vertical]') return children.filter((c) => c.hasAttribute('data-vertical'))
      if (sel === '[data-status]') return children.filter((c) => c.hasAttribute('data-status'))
      return [...children]
    },
  }
}

/**
 * Runs the real client-side script produced by `renderPlatformsBody()` against
 * a fake `document` and a stubbed `fetch` resolving to the given platforms, and
 * returns `#grid`'s final `innerHTML` — every card's markup, joined, exactly as
 * a browser would render it.
 */
export async function renderGrid(
  platforms: PlatformEntry[],
  opts: Parameters<typeof renderPlatformsBody>[0] = {},
): Promise<string> {
  const html = renderPlatformsBody(opts)
  const script = extractScript(html)

  const grid = stubElement()
  const byId: Record<string, unknown> = {
    grid,
    empty: stubElement(),
    count: stubElement(),
    q: stubElement(),
    'vertical-filters': stubElement(),
    'status-filters': stubElement(),
  }
  const fakeDocument = {
    getElementById: (id: string) => byId[id],
    createElement: () => stubElement(),
  }
  const counts: Record<string, number> = {}
  for (const p of platforms) {
    const key = String(p.vertical)
    counts[key] = (counts[key] ?? 0) + 1
  }
  const fetchStub = async () => ({
    json: async () => ({ total: platforms.length, counts, platforms }),
  })

  // The script's one top-level statement is an invoked async IIFE
  // (`(async function () {...})()`). Wrapping it in `return (...)` — with no
  // newline between `return` and `(` — turns that expression statement into a
  // return statement without tripping automatic-semicolon-insertion, so `run()`
  // resolves once the IIFE (and its internal `await fetch(...)`) finishes.
  const run = new Function('document', 'fetch', `return (${script.trim()})`) as (
    doc: unknown,
    fetchImpl: unknown,
  ) => Promise<void>
  await run(fakeDocument, fetchStub)
  return grid.innerHTML
}

/**
 * A rendered page plus the browser surface the vertical deep link reads:
 * `location.hash`, `hashchange` on `window`, and `history.replaceState`.
 * Omit `hash` to run with no `location`/`window`/`history` at all, as
 * `renderGrid()` does; `hash: ''` is a browser whose URL has no fragment.
 */
export interface RenderedPage {
  /** `data-vertical` of the one pressed pill, or `'all'` for the All pill. */
  pressed(): string
  /** Names of the platforms in `#grid`, in order. */
  shown(): string[]
  /** Current `location.hash`, including any `replaceState` the script did. */
  hash(): string
  /** Navigates to a new hash and fires `hashchange`, like the address bar. */
  setHash(hash: string): void
  /** Clicks the pill for `vertical`, or the All pill for `'all'`. */
  click(vertical: string): void
  /** `data-status` of the one pressed status pill (`'all'` for its All). */
  pressedStatus(): string
  /** The status pills' text, in order, e.g. `['All · 4', 'Unsupported · 1']`. */
  statusLabels(): string[]
  /** Clicks the status pill whose `data-status` is `status`. */
  clickStatus(status: string): void
}

export async function renderPage(
  platforms: PlatformEntry[],
  opts: Parameters<typeof renderPlatformsBody>[0] = {},
  browser: { hash?: string } = {},
): Promise<RenderedPage> {
  const script = extractScript(renderPlatformsBody(opts))
  const grid = stubElement()
  const filters = stubElement()
  const statusFilters = stubElement()
  const byId: Record<string, unknown> = {
    grid,
    empty: stubElement(),
    count: stubElement(),
    q: stubElement(),
    'vertical-filters': filters,
    'status-filters': statusFilters,
  }
  const fakeDocument = {
    getElementById: (id: string) => byId[id],
    createElement: () => stubElement(),
  }
  const counts: Record<string, number> = {}
  for (const p of platforms) counts[String(p.vertical)] = (counts[String(p.vertical)] ?? 0) + 1
  const fetchStub = async () => ({
    json: async () => ({ total: platforms.length, counts, platforms }),
  })

  const hashListeners: Array<() => void> = []
  const fakeLocation = { hash: browser.hash ?? '', pathname: '/platforms', search: '' }
  const fakeWindow = {
    addEventListener(type: string, fn: () => void) {
      if (type === 'hashchange') hashListeners.push(fn)
    },
  }
  const fakeHistory = {
    replaceState(_state: unknown, _title: string, url: string) {
      const i = url.indexOf('#')
      fakeLocation.hash = i === -1 ? '' : url.slice(i)
    },
  }
  const withBrowser = 'hash' in browser
  const run = new Function(
    'document',
    'fetch',
    'location',
    'window',
    'history',
    `return (${script.trim()})`,
  ) as (...args: unknown[]) => Promise<void>
  await run(
    fakeDocument,
    fetchStub,
    withBrowser ? fakeLocation : undefined,
    withBrowser ? fakeWindow : undefined,
    withBrowser ? fakeHistory : undefined,
  )

  const pills = filters.children
  return {
    pressed() {
      const on = pills.filter((p) => p.getAttribute('aria-pressed') === 'true')
      if (on.length !== 1) throw new Error(`expected one pressed pill, got ${on.length}`)
      return on[0].getAttribute('data-vertical') ?? 'all'
    },
    shown() {
      return [...grid.innerHTML.matchAll(/class="provider-card__name">([^<]*)</g)].map((m) => m[1])
    },
    hash: () => fakeLocation.hash,
    setHash(hash: string) {
      fakeLocation.hash = hash
      for (const fn of hashListeners) fn()
    },
    click(vertical: string) {
      const pill =
        vertical === 'all'
          ? pills.find((p) => !p.hasAttribute('data-vertical'))
          : pills.find((p) => p.getAttribute('data-vertical') === vertical)
      if (!pill?.onclick) throw new Error(`no pill for ${vertical}`)
      pill.onclick()
    },
    pressedStatus() {
      const on = statusFilters.children.filter((p) => p.getAttribute('aria-pressed') === 'true')
      if (on.length !== 1) throw new Error(`expected one pressed status pill, got ${on.length}`)
      return on[0].getAttribute('data-status') ?? ''
    },
    statusLabels: () => statusFilters.children.map((p) => p.textContent),
    clickStatus(status: string) {
      const pill = statusFilters.children.find((p) => p.getAttribute('data-status') === status)
      if (!pill?.onclick) throw new Error(`no status pill for ${status}`)
      pill.onclick()
    },
  }
}
