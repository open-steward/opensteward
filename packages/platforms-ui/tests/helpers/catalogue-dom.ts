/**
 * A slightly richer stub than render-grid.ts, for what happens to the grid
 * *after* its markup is set: brand colours applied through CSSOM, and the
 * logo-error listener swapping a failed `<img>` for its monogram.
 *
 * Like render-grid.ts, it runs the real client script from
 * `renderPlatformsBody()`. The grid stub records its event listeners, and its
 * `querySelectorAll('[data-brand-bg]')` parses the markup the script wrote, so
 * a test sees the `style` properties the script set on each tile.
 */
import { renderPlatformsBody, type PlatformEntry, type PlatformsBodyOpts } from '../../src/index.js'

export interface StyledTile {
  bg: string | null
  fg: string | null
  style: Record<string, string>
}

function decodeAttr(v: string): string {
  return v
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function attrsOf(tag: string): Map<string, string> {
  const attrs = new Map<string, string>()
  for (const m of tag.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) attrs.set(m[1], decodeAttr(m[2]))
  return attrs
}

/** A container whose `querySelectorAll('[data-brand-bg]')` reads its own innerHTML. */
function container() {
  const tiles: StyledTile[] = []
  const classes: string[] = []
  const listeners: Record<string, Array<(ev: unknown) => void>> = {}
  return {
    innerHTML: '',
    tiles,
    classes,
    listeners,
    classList: {
      add: (c: string) => classes.push(c),
      remove() {},
      contains: () => false,
    },
    addEventListener(type: string, fn: (ev: unknown) => void) {
      ;(listeners[type] ??= []).push(fn)
    },
    querySelectorAll(sel: string) {
      if (sel !== '[data-brand-bg]') return []
      const found = [...this.innerHTML.matchAll(/<[a-z]+\b[^>]*\bdata-brand-bg="[^"]*"[^>]*>/g)].map((m) => {
        const a = attrsOf(m[0])
        const tile: StyledTile = { bg: a.get('data-brand-bg') ?? null, fg: a.get('data-brand-fg') ?? null, style: {} }
        tiles.push(tile)
        return { getAttribute: (k: string) => a.get(k) ?? null, style: tile.style }
      })
      return found
    },
  }
}

function inert() {
  return {
    innerHTML: '',
    textContent: '',
    hidden: false,
    className: '',
    type: '',
    onclick: null,
    children: [] as unknown[],
    setAttribute() {},
    getAttribute: () => null,
    hasAttribute: () => false,
    removeAttribute() {},
    classList: { add() {}, remove() {}, contains: () => false },
    addEventListener() {},
    appendChild(c: unknown) {
      this.children.push(c)
    },
    querySelectorAll: () => [],
  }
}

export interface Catalogue {
  /** `#grid`'s markup, as the script set it. */
  html: string
  /** Every brand tile the script styled in the grid, in order. */
  tiles: StyledTile[]
  /**
   * Fires the grid's `error` listener for the n-th `<img>` in the markup, as a
   * failed logo load would, and returns what replaced it.
   */
  logoError(n: number): { replacement: string; parentClasses: string[]; tiles: StyledTile[]; src: string | null }
}

export async function renderCatalogue(platforms: PlatformEntry[], opts: PlatformsBodyOpts = {}): Promise<Catalogue> {
  const html = renderPlatformsBody(opts)
  const m = html.match(/<script>([\s\S]*)<\/script>\s*$/)
  if (!m) throw new Error('renderPlatformsBody() output has no trailing <script> tag')
  const grid = container()
  const byId: Record<string, unknown> = {
    grid,
    empty: inert(),
    count: inert(),
    q: inert(),
    'vertical-filters': inert(),
    'status-filters': inert(),
  }
  const counts: Record<string, number> = {}
  for (const p of platforms) counts[String(p.vertical)] = (counts[String(p.vertical)] ?? 0) + 1
  const run = new Function('document', 'fetch', `return (${m[1].trim()})`) as (d: unknown, f: unknown) => Promise<void>
  await run(
    { getElementById: (id: string) => byId[id], createElement: () => inert() },
    async () => ({ json: async () => ({ total: platforms.length, counts, platforms }) }),
  )

  return {
    html: grid.innerHTML,
    tiles: grid.tiles,
    logoError(n: number) {
      const imgTag = [...grid.innerHTML.matchAll(/<img\b[^>]*>/g)][n]?.[0]
      if (!imgTag) throw new Error(`no <img> #${n} in the grid`)
      const a = attrsOf(imgTag)
      const parent = container()
      let replacement = ''
      const img = {
        tagName: 'IMG',
        parentElement: parent,
        hasAttribute: (k: string) => a.has(k),
        getAttribute: (k: string) => a.get(k) ?? null,
        removeAttribute: (k: string) => a.delete(k),
        get src() {
          return a.get('src') ?? ''
        },
        set src(v: string) {
          a.set('src', v)
        },
        set outerHTML(v: string) {
          replacement = v
          parent.innerHTML = v
        },
      }
      for (const fn of grid.listeners.error ?? []) fn({ target: img })
      return { replacement, parentClasses: parent.classes, tiles: parent.tiles, src: a.get('src') ?? null }
    },
  }
}
