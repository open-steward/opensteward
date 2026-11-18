/**
 * AgileCRM list paging.
 *
 * Contacts and deals page by an opaque cursor (docs: "Paging can be applied
 * using the page_size and cursor query parameters. ... Cursor for the next
 * page will be in the last contact of the list. If there is no cursor, it
 * means that it is the end of list."). The adapter once sent `cursor=0` on
 * every page, so page 2 repeated page 1.
 *
 * Tracks (`/milestone/pipelines`) are not paginated: "Gets all the tracks."
 * They are sliced locally.
 *
 * The fake upstream honours ONLY the documented parameters: `page_size` and
 * `cursor` on contacts and deals, nothing on pipelines.
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
import { AgileCrmAdapter } from '../../../../../../src/verticals/crm/adapters/agilecrm/index'

const creds: Credentials = {
  accessToken: 'api-key',
  extra: { email: 'me@example.test', domain: 'acme' },
} as Credentials

interface Seen {
  path: string
  query: URLSearchParams
}

let seen: Seen[] = []

/** A cursor-paged upstream: cursor = "c<offset>", carried on the last row. */
function cursorRows(
  n: number,
  make: (i: number) => Record<string, unknown>,
  prefix = 'c',
  firstId = 1,
) {
  const rows = Array.from({ length: n }, (_, i) => make(i + firstId))
  return (query: URLSearchParams): Record<string, unknown>[] => {
    const size = Number(query.get('page_size') ?? '25')
    const cursor = query.get('cursor')
    let start = 0
    if (cursor !== null) {
      const m = new RegExp(`^${prefix}(\\d+)$`).exec(cursor)
      if (!m) throw new Error(`undocumented cursor value: ${cursor}`)
      start = Number(m[1])
    }
    const page = rows.slice(start, start + size).map((r) => ({ ...r }))
    const end = start + page.length
    if (page.length > 0 && end < rows.length) page[page.length - 1]!['cursor'] = `${prefix}${end}`
    return page
  }
}

function install(routes: Record<string, (q: URLSearchParams) => unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      const path = url.pathname.replace(/^\/dev\/api/, '')
      seen.push({ path, query: url.searchParams })
      const route = routes[`${url.hostname}${path}`] ?? routes[path]
      if (!route) return new Response('not found', { status: 404 })
      return new Response(JSON.stringify(route(url.searchParams)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
}

const contact = (i: number) => ({ id: i, properties: [], created_time: 1_700_000_000 })
const deal = (i: number) => ({ id: i, name: `Deal ${i}`, created_time: 1_700_000_000 })
const track = (i: number) => ({ id: i, name: `Track ${i}`, milestones: [] })

beforeEach(() => {
  seen = []
  _resetCursorPager()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

type ListMethod = 'listContacts' | 'listDeals'

describe.each<[ListMethod, string, (i: number) => Record<string, unknown>]>([
  ['listContacts', '/contacts', contact],
  ['listDeals', '/opportunity', deal],
])('agilecrm %s pages by cursor', (method, path, make) => {
  const L = 3
  const N = 2 * L + 1

  it('serves every row once, in order, with exact hasMore', async () => {
    install({ [path]: cursorRows(N, make) })
    const adapter = new AgileCrmAdapter()
    const ids: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter[method](creds, params)
      ids.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
    expect(more).toEqual([true, true, false])
  })

  it('sends no cursor on page 1 and the documented cursor on page 2', async () => {
    install({ [path]: cursorRows(N, make) })
    const adapter = new AgileCrmAdapter()
    await adapter[method](creds, withPageSink({ page: 1, limit: L }))
    await adapter[method](creds, withPageSink({ page: 2, limit: L }))
    expect(seen[0]!.query.has('cursor')).toBe(false)
    expect(seen[0]!.query.get('page_size')).toBe(String(L))
    expect(seen[1]!.query.get('cursor')).toBe(`c${L}`)
    expect(seen[1]!.query.get('page_size')).toBe(String(L))
  })

  it('reaches page 2 cold by walking from page 1', async () => {
    install({ [path]: cursorRows(N, make) })
    const rows = await new AgileCrmAdapter()[method](creds, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(['4', '5', '6'])
  })

  it('a limit past the collection size serves every row in one page (no documented maximum)', async () => {
    install({ [path]: cursorRows(N, make) })
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await new AgileCrmAdapter()[method](creds, params)
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(seen[0]!.query.get('page_size')).toBe('500')
  })

  it('a cursor minted at one page size is not replayed for another', async () => {
    install({ [path]: cursorRows(N, make) })
    const adapter = new AgileCrmAdapter()
    await adapter[method](creds, withPageSink({ page: 1, limit: L }))
    await adapter[method](creds, withPageSink({ page: 2, limit: L }))
    // Page 2 at size 5 is rows 6-7; replaying the size-3 cursor c3 would serve 4-7.
    const rows = await adapter[method](creds, withPageSink({ page: 2, limit: 5 }))
    expect(rows.map((r) => r.id)).toEqual(['6', '7'])
  })

  it('each connection walks its own cursors', async () => {
    const other: Credentials = {
      accessToken: 'other-key',
      extra: { email: 'you@example.test', domain: 'other' },
    } as Credentials
    // Connection B mints cursors A never sees ("b<offset>") and rejects A's.
    install({
      [path]: cursorRows(N, make),
      [`other.agilecrm.com${path}`]: cursorRows(N, make, 'b', 101),
    })
    const adapter = new AgileCrmAdapter()
    await adapter[method](creds, withPageSink({ page: 1, limit: L }))
    await adapter[method](creds, withPageSink({ page: 2, limit: L }))
    const rows = await adapter[method](other, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(['104', '105', '106'])
  })

  it('an empty cursor on the last row ends the list', async () => {
    install({ [path]: () => [{ ...make(1), cursor: '' }] })
    const params = withPageSink({ page: 1, limit: L })
    const rows = await new AgileCrmAdapter()[method](creds, params)
    expect(rows.map((r) => r.id)).toEqual(['1'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  // AgileCRM declares no maxPageSize, so the router passes no adapter here.
  it('through the API path, meta.hasMore is true on a full page with a next cursor', async () => {
    install({ [path]: cursorRows(N, make) })
    const adapter = new AgileCrmAdapter()
    const params = parseListQuery({ limit: String(L), page: '1' })
    const env = listPage<{ id: string }>(await adapter[method](creds, params), params, 'agilecrm')
    expect(env.meta.hasMore).toBe(true)
    expect(env.data).toHaveLength(L)

    const last = parseListQuery({ limit: String(L), page: '3' })
    const envLast = listPage<{ id: string }>(await adapter[method](creds, last), last, 'agilecrm')
    expect(envLast.meta.hasMore).toBe(false)
    expect(envLast.data.map((r) => r.id)).toEqual([String(N)])
  })
})

describe('agilecrm listPipelines pages locally', () => {
  const L = 3
  const N = 2 * L + 1
  const all = Array.from({ length: N }, (_, i) => track(i + 1))

  it('serves every track once, in order, with exact hasMore', async () => {
    install({ '/milestone/pipelines': () => all })
    const adapter = new AgileCrmAdapter()
    const ids: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listPipelines(creds, params)
      ids.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
    expect(more).toEqual([true, true, false])
    // The endpoint takes no paging parameters.
    for (const s of seen) expect([...s.query.keys()]).toEqual([])
  })

  it('a limit above the collection serves every track', async () => {
    install({ '/milestone/pipelines': () => all })
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await new AgileCrmAdapter().listPipelines(creds, params)
    expect(rows).toHaveLength(N)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('through the API path, meta.hasMore is exact', async () => {
    install({ '/milestone/pipelines': () => all })
    const adapter = new AgileCrmAdapter()
    const params = parseListQuery({ limit: String(L), page: '2' })
    const env = listPage(await adapter.listPipelines(creds, params), params, 'agilecrm')
    expect(env.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(env.meta.hasMore).toBe(true)
    expect(env.meta.totalCount).toBe(N)
  })
})
