import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetCursorPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/crm/adapter/interface'
import { LoxoAdapter } from '../../../../../../src/verticals/crm/adapters/loxo/index'

/**
 * Pager keys and the caller-supplied scroll_id path.
 *
 * A Loxo scroll_id is a position inside one search context: it belongs to the
 * API key and the query that minted it. This fake models that by encoding the
 * token, query and offset into the scroll_id and serving the scroll_id's own
 * context when one is sent. A cursor memoised under a key that is missing the
 * connection, the filter or the page size is therefore replayed into the
 * wrong walk, and the rows show it.
 *
 * Row ids carry their context: token `key` adds 0, `key2` adds 1000; query
 * `a` adds 100, `b` adds 200; no query adds 0.
 */

const BASE = '/api/acme'
const credsFor = (token: string) => ({ accessToken: token, extra: { agencySlug: 'acme' } })
const TOKEN_BASE: Record<string, number> = { key: 0, key2: 1000 }
const QUERY_BASE: Record<string, number> = { '': 0, a: 100, b: 200 }

type Ctx = { t: string; q: string; o: number; b: number }
const enc = (c: Ctx) => Buffer.from(JSON.stringify(c)).toString('base64')
const dec = (s: string) => JSON.parse(Buffer.from(s, 'base64').toString()) as Ctx

let requests: URL[] = []

/**
 * people/companies honour per_page; deals ignores it and returns batches that
 * cycle through `dealBatches` (a short batch is not the end).
 */
function serve(n: number, dealBatches: number[] = [4]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input)
      requests.push(url)
      const auth = String((init?.headers as Record<string, string>)?.['Authorization'] ?? '')
      const token = auth.replace('Bearer ', '')
      const q = url.searchParams
      const scroll = q.get('scroll_id')
      const ctx: Ctx = scroll ? dec(scroll) : { t: token, q: q.get('query') ?? '', o: 0, b: 0 }
      const base = (TOKEN_BASE[ctx.t] ?? 0) + (QUERY_BASE[ctx.q] ?? 0)
      const size =
        url.pathname === `${BASE}/deals`
          ? dealBatches[ctx.b % dealBatches.length]!
          : Number(q.get('per_page') ?? 25)
      const results = Array.from({ length: Math.max(0, Math.min(size, n - ctx.o)) }, (_, i) => {
        const id = base + ctx.o + i + 1
        return { id, name: `r${id}`, title: `r${id}` }
      })
      const next = enc({ ...ctx, o: ctx.o + size, b: ctx.b + 1 })
      return new Response(JSON.stringify({ results, scroll_id: next }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
}

type Method = 'listContacts' | 'listCompanies' | 'listDeals'

async function call(method: Method, token: string, params: QueryParams) {
  const adapter = new LoxoAdapter()
  const fn = adapter[method] as (
    c: ReturnType<typeof credsFor>,
    p: QueryParams,
  ) => Promise<Array<{ id: string }>>
  return (await fn.call(adapter, credsFor(token), params)).map((r) => Number(r.id))
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i)

beforeEach(() => {
  requests = []
  _resetCursorPager()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each(['listContacts', 'listCompanies', 'listDeals'] as const)(
  'loxo %s pager key',
  (method) => {
    it('keeps each connection on its own walk', async () => {
      serve(20)
      await call(method, 'key', withPageSink({ page: 1, limit: 3 }))
      // key2 asks for page 2 cold: it must walk its own chain, not replay key's.
      expect(await call(method, 'key2', withPageSink({ page: 2, limit: 3 }))).toEqual(
        range(1004, 1006),
      )
      expect(await call(method, 'key2', withPageSink({ page: 1, limit: 3 }))).toEqual(
        range(1001, 1003),
      )
    })

    it('keeps each query on its own walk', async () => {
      serve(20)
      await call(method, 'key', withPageSink({ page: 1, limit: 3, query: 'a' }))
      expect(await call(method, 'key', withPageSink({ page: 2, limit: 3, query: 'b' }))).toEqual(
        range(204, 206),
      )
      expect(requests.every((r) => r.searchParams.get('query') !== null)).toBe(true)
    })

    it('restarts the walk when the limit changes between pages', async () => {
      serve(20)
      await call(method, 'key', withPageSink({ page: 1, limit: 3 }))
      expect(await call(method, 'key', withPageSink({ page: 2, limit: 5 }))).toEqual(range(6, 10))
    })

    it('fetches exactly the upstream page a caller-supplied scroll_id points at', async () => {
      serve(20)
      const scroll_id = enc({ t: 'key', q: '', o: 8, b: 2 })
      const params = withPageSink({ limit: 3, scroll_id } as QueryParams)
      const rows = await call(method, 'key', params)
      expect(requests).toHaveLength(1)
      expect(requests[0]!.searchParams.get('scroll_id')).toBe(scroll_id)
      expect(rows[0]).toBe(9)
      expect(readUpstreamPage(params)?.hasMore).toBe(true)
    })
  },
)

describe('loxo listDeals with variable upstream batches', () => {
  it('does not treat a short batch as the end of the chain', async () => {
    // Batches of 4, 2, 4: the 2-row batch is mid-chain.
    serve(10, [4, 2, 4])
    const seen: number[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3, 4]) {
      const params = withPageSink({ page, limit: 3 })
      seen.push(...(await call('listDeals', 'key', params)))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(range(1, 10))
    expect(hasMore).toEqual([true, true, true, false])
  })
})
