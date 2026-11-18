/**
 * Mixmax contacts paging.
 *
 * Every Mixmax collection pages by an opaque cursor (docs, "Pagination" on
 * https://developer.mixmax.com/reference/getting-started-with-the-api):
 * "`next` - A cursor used to fetch the next page in the collection ... The
 * next page can be fetched by passing `?next=<value>` on the querystring of
 * the next request." and "`hasNext` - Set to true if querying with `next`
 * will return more results." `limit` "Defaults to 50. The upper limit is
 * usually 300".
 *
 * The adapter once never read `page`, so page 2 repeated page 1.
 *
 * The fake upstream honours ONLY the documented parameters: `limit` (default
 * 50, capped at 300) and `next`. Like the real API it always returns a `next`
 * cursor, and only `hasNext` says whether it leads anywhere.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
} from '@opensteward/shared'
import { MixmaxAdapter } from '../../../../../../src/verticals/crm/adapters/mixmax/index'

const creds: Credentials = { accessToken: 'mixmax-token' } as Credentials

let seen: URLSearchParams[] = []

function contactsUpstream(n: number, prefix = 'n', firstId = 1) {
  const rows = Array.from({ length: n }, (_, i) => ({
    _id: `c${i + firstId}`,
    email: `c${i + firstId}@example.test`,
  }))
  return (query: URLSearchParams) => {
    const size = Math.min(Number(query.get('limit') ?? '50'), 300)
    const next = query.get('next')
    let start = 0
    if (next !== null) {
      const m = new RegExp(`^${prefix}(\\d+)$`).exec(next)
      if (!m) throw new Error(`undocumented next value: ${next}`)
      start = Number(m[1])
    }
    const page = rows.slice(start, start + size)
    const end = start + page.length
    return { results: page, next: `${prefix}${end}`, hasNext: end < rows.length }
  }
}

function install(route: (q: URLSearchParams) => unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      if (url.pathname !== '/v1/contacts') return new Response('not found', { status: 404 })
      seen.push(url.searchParams)
      return new Response(JSON.stringify(route(url.searchParams)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
}

beforeEach(() => {
  seen = []
  _resetCursorPager()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const ids = (from: number, count: number) => Array.from({ length: count }, (_, i) => `c${from + i}`)

describe('mixmax listContacts pages by the next cursor', () => {
  const L = 3
  const N = 2 * L + 1

  it('serves every row once, in order, with exact hasMore', async () => {
    install(contactsUpstream(N))
    const adapter = new MixmaxAdapter()
    const got: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listContacts(creds, params)
      got.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      // Below the 300 cap nothing is clamped, so no pageSize override is reported.
      expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
    }
    expect(got).toEqual(ids(1, N))
    expect(more).toEqual([true, true, false])
  })

  it('sends no cursor on page 1 and the documented next cursor on page 2', async () => {
    install(contactsUpstream(N))
    const adapter = new MixmaxAdapter()
    await adapter.listContacts(creds, withPageSink({ page: 1, limit: L }))
    await adapter.listContacts(creds, withPageSink({ page: 2, limit: L }))
    expect(seen[0]!.has('next')).toBe(false)
    expect(seen[0]!.get('limit')).toBe(String(L))
    expect(seen[1]!.get('next')).toBe(`n${L}`)
    expect(seen[1]!.get('limit')).toBe(String(L))
  })

  it('reaches page 3 cold by walking the cursor chain', async () => {
    install(contactsUpstream(N))
    const params = withPageSink({ page: 3, limit: L })
    const rows = await new MixmaxAdapter().listContacts(creds, params)
    expect(rows.map((r) => r.id)).toEqual([`c${N}`])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a next cursor with hasNext:false is the end, and a page past it is empty', async () => {
    install(contactsUpstream(L))
    const adapter = new MixmaxAdapter()
    const p1 = withPageSink({ page: 1, limit: L })
    expect((await adapter.listContacts(creds, p1)).map((r) => r.id)).toEqual(ids(1, L))
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    const p2 = withPageSink({ page: 2, limit: L })
    expect(await adapter.listContacts(creds, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('a limit above the documented 300 is clamped and still serves every row', async () => {
    const total = 700
    install(contactsUpstream(total))
    const adapter = new MixmaxAdapter()
    const got: string[] = []
    let hasMore: boolean | undefined = true
    for (let page = 1; hasMore; page++) {
      const params = withPageSink({ page, limit: 500 })
      const rows = await adapter.listContacts(creds, params)
      got.push(...rows.map((r) => r.id))
      const reported = readUpstreamPage(params)
      expect(reported?.pageSize).toBe(300)
      hasMore = reported?.hasMore
      if (page > 5) throw new Error('did not end')
    }
    expect(got).toEqual(ids(1, total))
    for (const q of seen) expect(q.get('limit')).toBe('300')
  })

  it('a cursor minted at one page size is not replayed for another', async () => {
    install(contactsUpstream(N))
    const adapter = new MixmaxAdapter()
    await adapter.listContacts(creds, withPageSink({ page: 1, limit: L }))
    await adapter.listContacts(creds, withPageSink({ page: 2, limit: L }))
    const rows = await adapter.listContacts(creds, withPageSink({ page: 2, limit: 5 }))
    expect(rows.map((r) => r.id)).toEqual(['c6', 'c7'])
  })

  it('a search is part of the walk', async () => {
    install(contactsUpstream(N))
    const adapter = new MixmaxAdapter()
    await adapter.listContacts(creds, withPageSink({ page: 1, limit: L }))
    await adapter.listContacts(creds, withPageSink({ page: 2, limit: L, search: 'x' } as never))
    // A different search must not reuse the unfiltered cursor: it walks from page 1.
    expect(seen[1]!.has('next')).toBe(false)
    expect(seen[1]!.get('search')).toBe('x')
    expect(seen[2]!.get('next')).toBe(`n${L}`)
  })

  it('each connection walks its own cursors', async () => {
    install(contactsUpstream(N))
    const adapter = new MixmaxAdapter()
    await adapter.listContacts(creds, withPageSink({ page: 1, limit: L }))
    await adapter.listContacts(creds, withPageSink({ page: 2, limit: L }))
    const other = { accessToken: 'other-token' } as Credentials
    await adapter.listContacts(other, withPageSink({ page: 2, limit: L }))
    expect(seen[2]!.has('next')).toBe(false)
    expect(seen[3]!.get('next')).toBe(`n${L}`)
  })

  // Mixmax declares no maxPageSize (listNotes does not page), so the router
  // passes no adapter here.
  it('through the API path, meta.hasMore is exact', async () => {
    install(contactsUpstream(N))
    const adapter = new MixmaxAdapter()
    const first = parseListQuery({ limit: String(L), page: '1' })
    const env = listPage(await adapter.listContacts(creds, first), first, 'mixmax')
    expect(env.meta.hasMore).toBe(true)
    expect(env.data.map((r) => r.id)).toEqual(ids(1, L))

    const last = parseListQuery({ limit: String(L), page: '3' })
    const envLast = listPage(await adapter.listContacts(creds, last), last, 'mixmax')
    expect(envLast.meta.hasMore).toBe(false)
    expect(envLast.data.map((r) => r.id)).toEqual([`c${N}`])
  })
})
