/**
 * EngageBay list paging.
 *
 * Contacts, companies, deals and tasks page by an opaque cursor carried on the
 * last record (docs, https://raw.githubusercontent.com/engagebay/restapi/master/README.md:
 * "Paging can be applied using the page_size and cursor query parameters.
 * Cursor for the next page will be in the last contact of the list. If there
 * is no cursor, it means that it is the end of list."). List calls are POSTs
 * with a form body. The adapter once read `params.cursor`, which no caller
 * sets, so page 2 repeated page 1.
 *
 * Tracks (`GET /tracks`) take no paging parameters and are sliced locally.
 *
 * The fake upstream honours ONLY the documented parameters: `page_size`
 * (max 100, "Max allowed is 100") and `cursor` in the form body.
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
import { EngagebayAdapter } from '../../../../../../src/verticals/crm/adapters/engagebay/index'

const creds: Credentials = { accessToken: 'api-key' } as Credentials

interface Seen {
  method: string
  path: string
  form: URLSearchParams
  query: URLSearchParams
}

let seen: Seen[] = []

const MAX = 100

/** A cursor-paged upstream: cursor = "<prefix><offset>", carried on the last row. */
function cursorRows(n: number, prefix = 'c', firstId = 1) {
  const rows = Array.from({ length: n }, (_, i) => ({
    id: i + firstId,
    name: `Row ${i + firstId}`,
  }))
  return (form: URLSearchParams): Record<string, unknown>[] => {
    const size = Number(form.get('page_size') ?? '25')
    if (size > MAX) throw new Error(`page_size ${size} above the documented maximum`)
    const cursor = form.get('cursor')
    let start = 0
    if (cursor !== null) {
      const m = new RegExp(`^${prefix}(\\d+)$`).exec(cursor)
      if (!m) throw new Error(`undocumented cursor value: ${cursor}`)
      start = Number(m[1])
    }
    const page: Record<string, unknown>[] = rows.slice(start, start + size).map((r) => ({ ...r }))
    const end = start + page.length
    if (page.length > 0 && end < rows.length) page[page.length - 1]!['cursor'] = `${prefix}${end}`
    return page
  }
}

function install(routes: Record<string, (form: URLSearchParams) => unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input)
      const path = url.pathname.replace(/^\/dev\/api\/panel/, '')
      const form = new URLSearchParams(typeof init?.body === 'string' ? init.body : '')
      seen.push({ method: init?.method ?? 'GET', path, form, query: url.searchParams })
      const route =
        routes[
          `${init?.headers ? (init.headers as Record<string, string>)['Authorization'] : ''}${path}`
        ] ?? routes[path]
      if (!route) return new Response('not found', { status: 404 })
      try {
        return new Response(JSON.stringify(route(form)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      } catch (e) {
        return new Response(String(e), { status: 400 })
      }
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

type ListMethod = 'listContacts' | 'listCompanies' | 'listDeals' | 'listActivities'

describe.each<[ListMethod, string]>([
  ['listContacts', '/subscribers'],
  ['listCompanies', '/companies'],
  ['listDeals', '/deals'],
  ['listActivities', '/tasks'],
])('engagebay %s pages by cursor', (method, path) => {
  const L = 3
  const N = 2 * L + 1

  it('serves every row once, in order, with exact hasMore', async () => {
    install({ [path]: cursorRows(N) })
    const adapter = new EngagebayAdapter()
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
    install({ [path]: cursorRows(N) })
    const adapter = new EngagebayAdapter()
    await adapter[method](creds, withPageSink({ page: 1, limit: L }))
    await adapter[method](creds, withPageSink({ page: 2, limit: L }))
    expect(seen).toHaveLength(2)
    expect(seen[0]!.method).toBe('POST')
    expect(seen[0]!.form.has('cursor')).toBe(false)
    expect(seen[0]!.form.get('page_size')).toBe(String(L))
    expect(seen[1]!.form.get('cursor')).toBe(`c${L}`)
    expect(seen[1]!.form.get('page_size')).toBe(String(L))
  })

  it('reaches page 2 cold by walking from page 1', async () => {
    install({ [path]: cursorRows(N) })
    const rows = await new EngagebayAdapter()[method](creds, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(['4', '5', '6'])
  })

  it('a limit above the maximum is clamped to 100 and still serves every row', async () => {
    const total = 2 * MAX + 1
    install({ [path]: cursorRows(total) })
    const adapter = new EngagebayAdapter()
    // The router clamps to the declared maximum before the adapter sees it.
    expect(adapter.capabilities.maxPageSize).toBe(MAX)
    const ids: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = parseListQuery({ limit: '500', page: String(page) }, adapter)
      expect(params.limit).toBe(MAX)
      const rows = await adapter[method](creds, params)
      ids.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(Array.from({ length: total }, (_, i) => String(i + 1)))
    expect(more).toEqual([true, true, false])
    for (const s of seen) expect(s.form.get('page_size')).toBe(String(MAX))
  })

  it('a cursor minted at one page size is not replayed for another', async () => {
    install({ [path]: cursorRows(N) })
    const adapter = new EngagebayAdapter()
    await adapter[method](creds, withPageSink({ page: 1, limit: L }))
    await adapter[method](creds, withPageSink({ page: 2, limit: L }))
    const rows = await adapter[method](creds, withPageSink({ page: 2, limit: 5 }))
    expect(rows.map((r) => r.id)).toEqual(['6', '7'])
  })

  it('an empty cursor on the last row ends the list', async () => {
    install({ [path]: () => [{ id: 1, cursor: '' }] })
    const params = withPageSink({ page: 1, limit: L })
    const rows = await new EngagebayAdapter()[method](creds, params)
    expect(rows.map((r) => r.id)).toEqual(['1'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('each connection walks its own cursors', async () => {
    const other: Credentials = { accessToken: 'other-key' } as Credentials
    install({
      [`api-key${path}`]: cursorRows(N),
      [`other-key${path}`]: cursorRows(N, 'b', 101),
    })
    const adapter = new EngagebayAdapter()
    await adapter[method](creds, withPageSink({ page: 1, limit: L }))
    await adapter[method](creds, withPageSink({ page: 2, limit: L }))
    const rows = await adapter[method](other, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(['104', '105', '106'])
  })

  it('a cursor from another collection on the same connection is not replayed', async () => {
    const [otherMethod, otherPath]: [ListMethod, string] =
      path === '/subscribers' ? ['listCompanies', '/companies'] : ['listContacts', '/subscribers']
    install({ [otherPath]: cursorRows(N, 'o', 201), [path]: cursorRows(N) })
    const adapter = new EngagebayAdapter()
    await adapter[otherMethod](creds, withPageSink({ page: 1, limit: L }))
    await adapter[otherMethod](creds, withPageSink({ page: 2, limit: L }))
    const rows = await adapter[method](creds, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(['4', '5', '6'])
  })

  it('a 200 whose body is not the documented array reads as an empty, ended page', async () => {
    install({ [path]: () => ({ unexpected: true }) })
    const params = withPageSink({ page: 1, limit: L })
    const rows = await new EngagebayAdapter()[method](creds, params)
    expect(rows).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('through the API path, meta.hasMore is exact', async () => {
    install({ [path]: cursorRows(N) })
    const adapter = new EngagebayAdapter()
    const params = parseListQuery({ limit: String(L), page: '1' }, adapter)
    const env = listPage<{ id: string }>(await adapter[method](creds, params), params, 'engagebay')
    expect(env.meta.hasMore).toBe(true)
    expect(env.data).toHaveLength(L)

    const last = parseListQuery({ limit: String(L), page: '3' }, adapter)
    const envLast = listPage<{ id: string }>(await adapter[method](creds, last), last, 'engagebay')
    expect(envLast.meta.hasMore).toBe(false)
    expect(envLast.data.map((r) => r.id)).toEqual([String(N)])
  })
})

describe('engagebay listPipelines pages locally', () => {
  const L = 3
  const N = 2 * L + 1
  const all = Array.from({ length: N }, (_, i) => ({
    id: i + 1,
    name: `Track ${i + 1}`,
    milestones: [],
  }))

  it('serves every track once, in order, with exact hasMore', async () => {
    install({ '/tracks': () => all })
    const adapter = new EngagebayAdapter()
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

  it('a 200 whose body is not the documented array reads as no tracks', async () => {
    install({ '/tracks': () => ({ unexpected: true }) })
    const params = withPageSink({ page: 1, limit: L })
    const rows = await new EngagebayAdapter().listPipelines(creds, params)
    expect(rows).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('through the API path, meta.hasMore is exact', async () => {
    install({ '/tracks': () => all })
    const adapter = new EngagebayAdapter()
    const params = parseListQuery({ limit: String(L), page: '2' }, adapter)
    const env = listPage(await adapter.listPipelines(creds, params), params, 'engagebay')
    expect(env.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(env.meta.hasMore).toBe(true)
  })
})
