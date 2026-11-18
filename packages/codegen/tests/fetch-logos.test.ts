/**
 * `fetchLogos` is driven from two places with very different needs: the CLI
 * (`pnpm --filter integration-server fetch:logos`), which writes files to a
 * repo checkout, and the admin-api logo-fetch worker, which streams bytes into
 * the database inside a container with a read-only filesystem.
 *
 * The first block below is the contract that matters most: **called the way
 * the CLI calls it, behaviour is byte-identical** — same files, same console
 * lines, same counters, same request sequence. Every option the worker needs
 * is additive and defaults to the CLI's behaviour.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fetchLogos, type PlatformLike, type FetchedLogo } from '../src/fetch-logos'

// Comfortably over PLACEHOLDER_MAX_BYTES (500), as a real logo is — a fixture
// under that threshold reads as a placeholder and gets refetched.
const SVG = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${'x'.repeat(600)}</svg>`)
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(200, 7),
])

function platform(slug: string, website = `https://${slug}.com`): PlatformLike {
  return { slug, name: slug, website, authType: 'oauth2' }
}

/** Records every URL requested, and answers from a slug -> response map. */
function stubFetch(
  responder: (url: string) => {
    status?: number
    body?: Buffer
    contentType?: string
    headers?: Record<string, string>
  },
): string[] {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (url: string) => {
    calls.push(url)
    const r = responder(url)
    const status = r.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (h: string) =>
          h.toLowerCase() === 'content-type'
            ? (r.contentType ?? 'image/svg+xml')
            : (r.headers?.[h.toLowerCase()] ?? null),
      },
      arrayBuffer: async () => {
        const b = r.body ?? Buffer.alloc(0)
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
      },
    }
  })
  return calls
}

describe('fetchLogos', () => {
  let dir: string
  let logged: string[]
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fetch-logos-test-'))
    logged = []
    logSpy = vi.spyOn(console, 'log').mockImplementation((line: string) => {
      logged.push(line)
    })
  })

  afterEach(() => {
    logSpy.mockRestore()
    vi.unstubAllGlobals()
    rmSync(dir, { recursive: true, force: true })
  })

  describe('CLI behaviour (no throttle/signal options) — must stay byte-identical', () => {
    it('writes an svg, logs the hit line, and counts it', async () => {
      stubFetch(() => ({ body: SVG, contentType: 'image/svg+xml' }))

      const res = await fetchLogos([platform('xero')], dir, { clientId: 'cid', delayMs: 0 })

      expect(res.fetched).toBe(1)
      expect(res.skipped).toBe(0)
      expect(res.notFound).toBe(0)
      expect(readFileSync(join(dir, 'xero.svg'))).toEqual(SVG)
      expect(logged).toEqual([`  ✅ xero → svg (${SVG.length} B)`])
    })

    it('walks the full fallback chain and lands on png', async () => {
      // logo.svg and symbol.svg 404, logo.png succeeds — the third attempt.
      const calls = stubFetch((url) =>
        url.includes('.svg') ? { status: 404 } : { body: PNG, contentType: 'image/png' },
      )

      const res = await fetchLogos([platform('acme')], dir, { clientId: 'cid', delayMs: 0 })

      expect(res.fetched).toBe(1)
      expect(readFileSync(join(dir, 'acme.png'))).toEqual(PNG)
      expect(calls).toEqual([
        'https://cdn.brandfetch.io/acme.com/logo.svg?c=cid',
        'https://cdn.brandfetch.io/acme.com/symbol.svg?c=cid',
        'https://cdn.brandfetch.io/acme.com/logo.png?c=cid',
      ])
    })

    it('logs the miss line and counts notFound when every attempt fails', async () => {
      const calls = stubFetch(() => ({ status: 404 }))

      const res = await fetchLogos([platform('ghost')], dir, { clientId: 'cid', delayMs: 0 })

      expect(res).toMatchObject({ fetched: 0, skipped: 0, notFound: 1 })
      expect(calls).toHaveLength(4)
      expect(logged).toEqual(['  ⚠️  ghost (ghost.com) — no logo found'])
      expect(existsSync(join(dir, 'ghost.svg'))).toBe(false)
    })

    it('skips a platform that already has a real file, and force overrides', async () => {
      writeFileSync(join(dir, 'xero.svg'), SVG)
      stubFetch(() => ({ body: SVG, contentType: 'image/svg+xml' }))

      const skipped = await fetchLogos([platform('xero')], dir, { clientId: 'cid', delayMs: 0 })
      expect(skipped).toMatchObject({ fetched: 0, skipped: 1 })

      const forced = await fetchLogos([platform('xero')], dir, {
        clientId: 'cid',
        delayMs: 0,
        force: true,
      })
      expect(forced).toMatchObject({ fetched: 1, skipped: 0 })
    })

    it('treats a <=500 byte file as a placeholder and refetches it', async () => {
      writeFileSync(join(dir, 'xero.svg'), Buffer.alloc(500))
      stubFetch(() => ({ body: SVG, contentType: 'image/svg+xml' }))

      const res = await fetchLogos([platform('xero')], dir, { clientId: 'cid', delayMs: 0 })
      expect(res).toMatchObject({ fetched: 1, skipped: 0 })
    })

    it('rejects a response that is not really an image', async () => {
      // 200 OK with an HTML error page — the shape a CDN returns for a
      // missing asset behind a friendly error handler.
      stubFetch(() => ({ body: Buffer.from('<html>not found</html>'), contentType: 'text/html' }))

      const res = await fetchLogos([platform('xero')], dir, { clientId: 'cid', delayMs: 0 })
      expect(res).toMatchObject({ fetched: 0, notFound: 1 })
    })

    it('filters to a single slug', async () => {
      stubFetch(() => ({ body: SVG, contentType: 'image/svg+xml' }))

      const res = await fetchLogos([platform('a'), platform('b')], dir, {
        clientId: 'cid',
        delayMs: 0,
        slug: 'b',
      })

      expect(res.fetched).toBe(1)
      expect(existsSync(join(dir, 'b.svg'))).toBe(true)
      expect(existsSync(join(dir, 'a.svg'))).toBe(false)
    })

    it('creates the output directory', async () => {
      stubFetch(() => ({ body: SVG, contentType: 'image/svg+xml' }))
      const nested = join(dir, 'a', 'b', 'logos')

      await fetchLogos([platform('xero')], nested, { clientId: 'cid', delayMs: 0 })
      expect(existsSync(join(nested, 'xero.svg'))).toBe(true)
    })

    it('reports zero throttled/cancelled counters when the features are unused', async () => {
      stubFetch(() => ({ body: SVG, contentType: 'image/svg+xml' }))
      const res = await fetchLogos([platform('xero')], dir, { clientId: 'cid', delayMs: 0 })
      expect(res.throttled).toBe(0)
      expect(res.cancelled).toBe(false)
    })

    it('uses the real 250ms delay when delayMs is not supplied', async () => {
      stubFetch(() => ({ body: SVG, contentType: 'image/svg+xml' }))
      const started = Date.now()

      await fetchLogos([platform('a'), platform('b')], dir, { clientId: 'cid' })

      // Two hits, each costing only the trailing sleep (the attempt loop
      // breaks before its own sleep on success). ~500ms, generously bounded.
      expect(Date.now() - started).toBeGreaterThanOrEqual(450)
    })
  })

  describe('sink mode (the worker path)', () => {
    it('hands bytes to onLogo and writes nothing to disk', async () => {
      stubFetch(() => ({ body: SVG, contentType: 'image/svg+xml' }))
      const got: FetchedLogo[] = []

      const res = await fetchLogos([platform('xero')], null, {
        clientId: 'cid',
        delayMs: 0,
        onLogo: (l) => {
          got.push(l)
        },
      })

      expect(res.fetched).toBe(1)
      expect(got).toHaveLength(1)
      expect(got[0]).toMatchObject({
        slug: 'xero',
        ext: 'svg',
        contentType: 'image/svg+xml',
        domain: 'xero.com',
      })
      expect(got[0].bytes).toEqual(SVG)
      expect(existsSync(join(dir, 'xero.svg'))).toBe(false)
    })

    it('refuses a null outputDir when there is no sink to catch the bytes', async () => {
      stubFetch(() => ({ body: SVG, contentType: 'image/svg+xml' }))

      await expect(fetchLogos([platform('xero')], null, { clientId: 'cid' })).rejects.toThrow(
        /outputDir is required/,
      )
    })

    it('awaits an async onLogo before moving on', async () => {
      stubFetch(() => ({ body: SVG, contentType: 'image/svg+xml' }))
      const order: string[] = []

      await fetchLogos([platform('a'), platform('b')], null, {
        clientId: 'cid',
        delayMs: 0,
        onLogo: async (l) => {
          await new Promise((r) => setTimeout(r, 5))
          order.push(l.slug)
        },
      })

      expect(order).toEqual(['a', 'b'])
    })

    it('uses isSatisfied instead of the on-disk placeholder test', async () => {
      stubFetch(() => ({ body: SVG, contentType: 'image/svg+xml' }))
      const stored = new Set(['a'])

      const res = await fetchLogos([platform('a'), platform('b')], null, {
        clientId: 'cid',
        delayMs: 0,
        onLogo: () => {},
        isSatisfied: (slug) => stored.has(slug),
      })

      expect(res).toMatchObject({ fetched: 1, skipped: 1 })
    })

    it('routes log lines to a supplied sink instead of console', async () => {
      stubFetch(() => ({ body: SVG, contentType: 'image/svg+xml' }))
      const lines: string[] = []

      await fetchLogos([platform('xero')], null, {
        clientId: 'cid',
        delayMs: 0,
        onLogo: () => {},
        log: (l) => lines.push(l),
      })

      expect(lines).toEqual([`  ✅ xero → svg (${SVG.length} B)`])
      expect(logged).toEqual([])
    })

    it('reports progress per platform with the outcome', async () => {
      stubFetch((url) => (url.includes('ghost') ? { status: 404 } : { body: SVG }))
      const seen: Array<{ slug: string; outcome: string; index: number; total: number }> = []

      await fetchLogos([platform('xero'), platform('ghost')], null, {
        clientId: 'cid',
        delayMs: 0,
        onLogo: () => {},
        onProgress: (p) =>
          seen.push({ slug: p.slug, outcome: p.outcome, index: p.index, total: p.total }),
      })

      expect(seen).toEqual([
        { slug: 'xero', outcome: 'fetched', index: 0, total: 2 },
        { slug: 'ghost', outcome: 'not_found', index: 1, total: 2 },
      ])
    })
  })

  describe('throttling', () => {
    it('counts a 429 as not_found when no throttle policy is given', async () => {
      // Without a throttle policy tryFetchLogo cannot tell 429 from 404,
      // so it counts as not_found.
      stubFetch(() => ({ status: 429 }))

      const res = await fetchLogos([platform('xero')], null, {
        clientId: 'cid',
        delayMs: 0,
        onLogo: () => {},
      })

      expect(res).toMatchObject({ notFound: 1, throttled: 0 })
    })

    it('retries a 429 and succeeds', async () => {
      let n = 0
      stubFetch(() => (++n === 1 ? { status: 429 } : { body: SVG }))
      const waits: number[] = []

      const res = await fetchLogos([platform('xero')], null, {
        clientId: 'cid',
        delayMs: 0,
        onLogo: () => {},
        throttle: { maxRetries: 3, baseDelayMs: 1, onThrottle: (_a, w) => waits.push(w) },
      })

      expect(res).toMatchObject({ fetched: 1, throttled: 0 })
      expect(waits).toHaveLength(1)
    })

    it('honours Retry-After over the computed backoff', async () => {
      let n = 0
      stubFetch(() =>
        ++n === 1 ? { status: 429, headers: { 'retry-after': '2' } } : { body: SVG },
      )
      const waits: number[] = []

      await fetchLogos([platform('xero')], null, {
        clientId: 'cid',
        delayMs: 0,
        onLogo: () => {},
        throttle: { maxRetries: 2, baseDelayMs: 1, onThrottle: (_a, w) => waits.push(w) },
      })

      expect(waits[0]).toBe(2000)
    })

    it('records a throttled platform separately from a miss once retries run out', async () => {
      stubFetch(() => ({ status: 429 }))

      const res = await fetchLogos([platform('xero')], null, {
        clientId: 'cid',
        delayMs: 0,
        onLogo: () => {},
        throttle: { maxRetries: 1, baseDelayMs: 1 },
      })

      // The whole point: a rate-limited run must not report the catalog as
      // "no logo available", which would make a retry skip everything.
      expect(res).toMatchObject({ fetched: 0, notFound: 0, throttled: 1 })
    })

    it('treats 503 as a throttle too', async () => {
      let n = 0
      stubFetch(() => (++n === 1 ? { status: 503 } : { body: SVG }))

      const res = await fetchLogos([platform('xero')], null, {
        clientId: 'cid',
        delayMs: 0,
        onLogo: () => {},
        throttle: { maxRetries: 2, baseDelayMs: 1 },
      })

      expect(res.fetched).toBe(1)
    })
  })

  describe('automated-traffic block', () => {
    // Brandfetch answers a request that fails its automated_traffic check with a
    // 302 to their guidelines page rather than an error status. Following that
    // redirect lands on HTML, fails the image sniff, and reads as "this platform
    // has no logo" — so a blocked deployment would silently report the entire
    // catalog as unavailable.
    const blockResponse = {
      status: 302,
      headers: { location: 'https://docs.brandfetch.com/docs/logo-link/guidelines#2-hotlinking' },
    }

    it('stops the run instead of reporting every platform as having no logo', async () => {
      stubFetch(() => blockResponse)

      await expect(
        fetchLogos([platform('a'), platform('b'), platform('c'), platform('d')], null, {
          clientId: 'cid',
          delayMs: 0,
          onLogo: () => {},
        }),
      ).rejects.toThrow(/automated traffic/i)
    })

    it('names the Referer it sent, which is the thing to fix', async () => {
      stubFetch(() => blockResponse)

      await expect(
        fetchLogos([platform('a'), platform('b'), platform('c'), platform('d')], null, {
          clientId: 'cid',
          referer: 'https://os.acme.test',
          delayMs: 0,
          onLogo: () => {},
        }),
      ).rejects.toThrow(/https:\/\/os\.acme\.test/)
    })

    it('points at the guidelines and says storing is caching', async () => {
      stubFetch(() => blockResponse)
      const err = await fetchLogos([platform('a'), platform('b'), platform('c')], null, {
        clientId: 'cid',
        delayMs: 0,
        onLogo: () => {},
      }).catch((e) => e)

      expect(err.message).toMatch(/caching/i)
      expect(err.message).toMatch(/docs\.brandfetch\.com/)
    })

    it('tolerates an isolated block rather than failing the whole run', async () => {
      let n = 0
      stubFetch(() => (++n === 1 ? blockResponse : { body: SVG }))

      const res = await fetchLogos([platform('a')], null, {
        clientId: 'cid',
        delayMs: 0,
        onLogo: () => {},
      })
      // One bounced attempt falls through to the next format in the chain.
      expect(res.fetched).toBe(1)
    })

    it('still follows an ordinary CDN redirect', async () => {
      let n = 0
      stubFetch((url) =>
        url.includes('/moved')
          ? { body: SVG }
          : ++n === 1
            ? { status: 302, headers: { location: 'https://cdn.brandfetch.io/moved/logo.svg' } }
            : { body: SVG },
      )

      const res = await fetchLogos([platform('a')], null, {
        clientId: 'cid',
        delayMs: 0,
        onLogo: () => {},
      })
      expect(res.fetched).toBe(1)
    })
  })

  describe('cancellation', () => {
    it('stops between platforms when the signal aborts', async () => {
      const ac = new AbortController()
      stubFetch(() => ({ body: SVG }))
      const done: string[] = []

      const res = await fetchLogos([platform('a'), platform('b'), platform('c')], null, {
        clientId: 'cid',
        delayMs: 0,
        signal: ac.signal,
        onLogo: (l) => {
          done.push(l.slug)
          if (done.length === 1) ac.abort()
        },
      })

      expect(res.cancelled).toBe(true)
      expect(done).toEqual(['a'])
      expect(res.fetched).toBe(1)
    })

    it('reports an already-aborted signal without making a request', async () => {
      const ac = new AbortController()
      ac.abort()
      const calls = stubFetch(() => ({ body: SVG }))

      const res = await fetchLogos([platform('a')], null, {
        clientId: 'cid',
        delayMs: 0,
        signal: ac.signal,
        onLogo: () => {},
      })

      expect(res.cancelled).toBe(true)
      expect(calls).toEqual([])
    })
  })
})
