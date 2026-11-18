/**
 * LiveAgent list paging.
 *
 * The API v3 spec (https://support.ladesk.com/docs/api/v3/, served from
 * api-docs-generator.php) documents GET /tickets, /tickets/{ticketId}/messages,
 * /contacts, /agents, /departments and /canned_messages with the query
 * parameters `_page` ("Page to display. Not used if _from is defined.",
 * default 1) and `_perPage` ("Results per page. Used only if _page is used.",
 * default 10), and a bare JSON array response with no total or next link.
 * GET /tags documents no parameters at all.
 *
 * The adapter used to send `page` and `per_page`, names LiveAgent does not
 * read, so every call was the default first page of 10.
 *
 * The fake below honours ONLY `_page` and `_perPage` (with their documented
 * defaults) on the paged endpoints, and returns every tag on /tags whatever
 * it is sent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { LiveagentAdapter } from '../../../../../../src/verticals/customer-support/adapters/liveagent/index'

const creds: Credentials = { accessToken: 'key', extra: { subdomain: 'acme' } }

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let handler: (path: string, params: Record<string, unknown>, apikey: string) => unknown

beforeEach(() => {
  calls = []
  _resetRowPager()
  vi.spyOn(axios, 'create').mockImplementation(
    (config) =>
      ({
        get: async (path: string, cfg?: { params?: Record<string, unknown> }) => {
          const params = { ...(cfg?.params ?? {}) }
          calls.push({ path, params })
          const headers = config?.headers as Record<string, unknown> | undefined
          return { data: handler(path, params, String(headers?.['apikey'] ?? '')) }
        },
      }) as unknown as ReturnType<typeof axios.create>,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** A documented `_page` + `_perPage` endpoint over `rows`. */
function paged(rows: unknown[]) {
  return (_path: string, params: Record<string, unknown>) => {
    const page = Number(params['_page'] ?? 1)
    const size = Number(params['_perPage'] ?? 10)
    return rows.slice((page - 1) * size, page * size)
  }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))

/** Message groups of two messages each, flattening to message ids 1..n. */
function groups(n: number) {
  const out: unknown[] = []
  for (let i = 1; i <= n; i += 2) {
    const messages = [{ id: String(i), message: `m${i}` }]
    if (i + 1 <= n) messages.push({ id: String(i + 1), message: `m${i + 1}` })
    out.push({ id: `g${i}`, messages })
  }
  return out
}

async function walk(run: (p: QueryParams) => Promise<{ id: string }[]>, limit: number) {
  const ids: string[] = []
  const hasMore: (boolean | null | undefined)[] = []
  const reported: (boolean | undefined)[] = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    ids.push(...rows.map((r) => r.id))
    reported.push(readUpstreamPage(params)?.hasMore)
    hasMore.push(listPage(rows, params, 'liveagent').meta.hasMore)
  }
  return { ids, hasMore, reported }
}

const adapter = new LiveagentAdapter()

const cases = [
  {
    name: 'listTickets',
    path: '/tickets',
    rows: (n: number) => range(n).map((id) => ({ id, subject: `T${id}` })),
    run: (p: QueryParams) => adapter.listTickets(creds, p),
  },
  {
    name: 'listContacts',
    path: '/contacts',
    rows: (n: number) => range(n).map((id) => ({ id, firstname: `C${id}` })),
    run: (p: QueryParams) => adapter.listContacts(creds, p),
  },
  {
    name: 'listUsers',
    path: '/agents',
    rows: (n: number) => range(n).map((id) => ({ id, name: `A${id}` })),
    run: (p: QueryParams) => adapter.listUsers(creds, p),
  },
  {
    name: 'listTeams',
    path: '/departments',
    rows: (n: number) => range(n).map((id) => ({ department_id: id, name: `D${id}` })),
    run: (p: QueryParams) => adapter.listTeams(creds, p),
  },
  {
    name: 'listMacros',
    path: '/canned_messages',
    rows: (n: number) => range(n).map((id) => ({ id, keywords: `k${id}` })),
    run: (p: QueryParams) => adapter.listMacros(creds, p),
  },
  {
    name: 'listMessages',
    path: '/tickets/t1/messages',
    rows: groups,
    run: (p: QueryParams) => adapter.listMessages(creds, 't1', p),
  },
] as const

describe.each(cases)('liveagent $name paging', ({ path, rows, run }) => {
  it('serves every row once, in order, across pages of 2L+1 rows', async () => {
    const L = 5
    handler = paged(rows(2 * L + 1))
    const { ids, hasMore, reported } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    // The sync worker reads only the reported flag, so pin it on its own.
    expect(reported).toEqual([true, true, false])
  })

  it('an exact multiple of the limit ends on its last full page', async () => {
    handler = paged(rows(10))
    const { ids, hasMore, reported } = await walk(run, 5)
    expect(ids).toEqual(range(10))
    expect(hasMore).toEqual([true, false, false])
    expect(reported).toEqual([true, false, false])
  })

  it('only ever sends the documented _page and _perPage', async () => {
    handler = paged(rows(30))
    await run(withPageSink({ page: 1, limit: 7 }))
    await run(withPageSink({ page: 2, limit: 7 }))
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) {
      expect(c.path).toBe(path)
      expect(Object.keys(c.params).sort()).toEqual(['_page', '_perPage'])
    }
    expect(calls.some((c) => c.params['_page'] === 2)).toBe(true)
  })

  it('a limit above the maximum is clamped', async () => {
    handler = paged(rows(600))
    const params = parseListQuery({ limit: '9999' })
    expect(params.limit).toBe(500)
    const out: { id: string }[] = await run(params)
    expect(calls[0]).toEqual({ path, params: { _page: 1, _perPage: 500 } })
    expect(out.map((r) => r.id)).toEqual(range(500))
    expect(listPage(out, params, 'liveagent').meta.hasMore).toBe(true)
  })

  it('a server that caps _perPage below the limit still serves every row', async () => {
    // LiveAgent documents no maximum. A silent cap must not read as the end.
    const all = rows(23)
    handler = (_p, params) => {
      const page = Number(params['_page'] ?? 1)
      const size = Math.min(Number(params['_perPage'] ?? 10), 4)
      return all.slice((page - 1) * size, page * size)
    }
    const { ids, hasMore } = await walk(run, 10)
    expect(ids).toEqual(range(23))
    expect(hasMore).toEqual([true, true, false])
  })

  it('serves page 2 through parseListQuery and listPage', async () => {
    handler = paged(rows(12))
    const params = parseListQuery({ page: '2', limit: '5' })
    const out: { id: string }[] = await run(params)
    const env = listPage(out, params, 'liveagent')
    expect(env.data.map((r) => r.id)).toEqual(['6', '7', '8', '9', '10'])
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('liveagent listTags paging', () => {
  const tags = (n: number) => range(n).map((id) => ({ id, name: `tag${id}` }))

  it('GET /tags takes no paging parameter, so the whole list is sliced locally', async () => {
    const L = 5
    handler = () => tags(2 * L + 1)
    const { ids, hasMore, reported } = await walk((p) => adapter.listTags(creds, p), L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(reported).toEqual([true, true, false])
    expect(calls.every((c) => c.path === '/tags' && Object.keys(c.params).length === 0)).toBe(true)
  })

  it('serves page 2 through parseListQuery and listPage', async () => {
    handler = () => tags(12)
    const params = parseListQuery({ page: '2', limit: '5' })
    const out = await adapter.listTags(creds, params)
    const env = listPage(out, params, 'liveagent')
    expect(env.data.map((r) => r.id)).toEqual(['6', '7', '8', '9', '10'])
    expect(env.meta.hasMore).toBe(true)
    expect(env.meta.totalCount).toBe(12)
  })
})

/**
 * The pager remembers where each upstream page starts, and holds the last
 * page it peeked at, under a key. Each test runs a warm page 1 and then a
 * page 2 that must NOT share that memory: a key that drops the connection,
 * the collection (or ticket), or `_perPage` serves the first walk's rows.
 */
describe('liveagent pager key', () => {
  const ids = (prefix: string, n: number) => range(n).map((i) => `${prefix}${i}`)

  it('keeps two API keys on the same subdomain apart', async () => {
    const a: Credentials = { accessToken: 'key-a', extra: { subdomain: 'acme' } }
    const b: Credentials = { accessToken: 'key-b', extra: { subdomain: 'acme' } }
    const byKey: Record<string, unknown[]> = {
      'key-a': ids('a', 12).map((id) => ({ id, subject: id })),
      'key-b': ids('b', 12).map((id) => ({ id, subject: id })),
    }
    handler = (path, params, apikey) => paged(byKey[apikey] ?? [])(path, params)
    const first = await adapter.listTickets(a, withPageSink({ page: 1, limit: 5 }))
    expect(first.map((r) => r.id)).toEqual(ids('a', 5))
    const second = await adapter.listTickets(b, withPageSink({ page: 2, limit: 5 }))
    expect(second.map((r) => r.id)).toEqual(['b6', 'b7', 'b8', 'b9', 'b10'])
  })

  it('keeps two collections of one connection apart', async () => {
    const byPath: Record<string, unknown[]> = {
      '/tickets': ids('t', 12).map((id) => ({ id, subject: id })),
      '/contacts': ids('c', 12).map((id) => ({ id, firstname: id })),
    }
    handler = (path, params) => paged(byPath[path] ?? [])(path, params)
    await adapter.listTickets(creds, withPageSink({ page: 1, limit: 5 }))
    const out = await adapter.listContacts(creds, withPageSink({ page: 2, limit: 5 }))
    expect(out.map((r) => r.id)).toEqual(['c6', 'c7', 'c8', 'c9', 'c10'])
  })

  it("keeps two tickets' messages apart", async () => {
    const msgs = (prefix: string) =>
      ids(prefix, 12).map((id) => ({ id: `g-${id}`, messages: [{ id, message: id }] }))
    const byPath: Record<string, unknown[]> = {
      '/tickets/t1/messages': msgs('x'),
      '/tickets/t2/messages': msgs('y'),
    }
    handler = (path, params) => paged(byPath[path] ?? [])(path, params)
    await adapter.listMessages(creds, 't1', withPageSink({ page: 1, limit: 5 }))
    const out = await adapter.listMessages(creds, 't2', withPageSink({ page: 2, limit: 5 }))
    expect(out.map((r) => r.id)).toEqual(['y6', 'y7', 'y8', 'y9', 'y10'])
  })

  it('a walk at one limit does not steer a page at another', async () => {
    handler = paged(range(30).map((id) => ({ id, subject: id })))
    await adapter.listTickets(creds, withPageSink({ page: 1, limit: 5 }))
    const out = await adapter.listTickets(creds, withPageSink({ page: 2, limit: 7 }))
    expect(out.map((r) => r.id)).toEqual(range(14).slice(7))
  })

  it('with no limit, asks upstream for the same page size it serves', async () => {
    handler = paged(range(150).map((id) => ({ id, subject: id })))
    const params = withPageSink({ page: 1 })
    const out = await adapter.listTickets(creds, params)
    expect(calls[0]?.params).toEqual({ _page: 1, _perPage: 100 })
    expect(out.map((r) => r.id)).toEqual(range(100))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })
})
