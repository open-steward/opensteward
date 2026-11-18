/**
 * Zenvia Customer Cloud list paging.
 *
 * The API reference (https://sales.zenvia.com/, a Redoc page with the spec
 * embedded) documents `before`, `after` and `limit` on GET /prospects and
 * GET /prospects/interactions only:
 *   - before: "Limits the results only to the prospects created before the
 *     one provided in this parameter (not included)"
 *   - limit: "The maximum number of items that must be returned (A multiple
 *     number of 100 and no more than 1000 is recommended)"
 *   - 200: "An array of ... sorted by descending creation date." (a bare array)
 * GET /prospect/{prospectId}/interactions, GET /agents and GET /groups
 * document no paging parameter and return the whole list.
 *
 * The adapter used to send `limit` alone (and `after` for a caller cursor
 * the router never passes), so page 2 repeated page 1.
 *
 * The fake below honours ONLY `limit` and `before` on the two paged
 * endpoints, over rows already in descending creation order, and returns
 * everything on the other three whatever it is sent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { ZenviaAdapter } from '../../../../../../src/verticals/customer-support/adapters/zenvia/index'

const creds: Credentials = { accessToken: 'key-a' }

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let handler: (path: string, params: Record<string, unknown>) => unknown

beforeEach(() => {
  calls = []
  _resetCursorPager()
  vi.spyOn(axios, 'create').mockImplementation(
    () =>
      ({
        get: async (path: string, cfg?: { params?: Record<string, unknown> }) => {
          const params = { ...(cfg?.params ?? {}) }
          calls.push({ path, params })
          return { data: handler(path, params) }
        },
      }) as unknown as ReturnType<typeof axios.create>,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** A documented `limit` + `before` endpoint over rows in descending creation order. */
function paged(rows: { id: string }[]) {
  return (_path: string, params: Record<string, unknown>) => {
    const before = params['before']
    const start = before === undefined ? 0 : rows.findIndex((r) => r.id === before) + 1
    const limit = params['limit'] === undefined ? rows.length : Number(params['limit'])
    return rows.slice(start, start + limit)
  }
}

const range = (n: number) =>
  Array.from({ length: n }, (_, i) => `r${String(i + 1).padStart(4, '0')}`)

async function walk(run: (p: QueryParams) => Promise<{ id: string }[]>, limit: number) {
  const ids: string[] = []
  const hasMore: (boolean | null | undefined)[] = []
  const reported: (boolean | undefined)[] = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    ids.push(...rows.map((r) => r.id))
    reported.push(readUpstreamPage(params)?.hasMore)
    hasMore.push(listPage(rows, params, 'zenvia').meta.hasMore)
  }
  return { ids, hasMore, reported }
}

const adapter = new ZenviaAdapter()

const cursorCases = [
  {
    name: 'listTickets',
    path: '/prospects/interactions',
    run: (p: QueryParams) => adapter.listTickets(creds, p),
  },
  {
    name: 'listContacts',
    path: '/prospects',
    run: (p: QueryParams) => adapter.listContacts(creds, p),
  },
] as const

describe.each(cursorCases)('zenvia $name paging (limit + before)', ({ path, run }) => {
  const rows = (n: number) => range(n).map((id) => ({ id, status: 'open', via: 'email' }))

  it('serves every row once, in order, across pages of 2L+1 rows', async () => {
    const L = 5
    handler = paged(rows(2 * L + 1))
    const { ids, hasMore, reported } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(reported).toEqual([true, true, false])
  })

  it('the page-2 request carries before=<last id of page 1>, and only documented params', async () => {
    handler = paged(rows(30))
    await run(withPageSink({ page: 1, limit: 7 }))
    await run(withPageSink({ page: 2, limit: 7 }))
    expect(calls).toHaveLength(2)
    for (const c of calls) {
      expect(c.path).toBe(path)
      for (const k of Object.keys(c.params)) expect(['api-key', 'limit', 'before']).toContain(k)
    }
    expect(calls[0]?.params['before']).toBeUndefined()
    expect(calls[1]?.params).toEqual({ 'api-key': 'key-a', limit: 7, before: range(7)[6] })
  })

  it('a limit above the documented 1000 is clamped', async () => {
    handler = paged(rows(1200))
    const out = await run(withPageSink({ page: 1, limit: 5000 }))
    expect(calls[0]?.params['limit']).toBe(1000)
    expect(out).toHaveLength(1000)
    const routed = parseListQuery({ limit: '5000' }, adapter)
    expect(routed.limit).toBeLessThanOrEqual(1000)
  })

  it('serves page 2 through parseListQuery and listPage', async () => {
    handler = paged(rows(12))
    const params = parseListQuery({ page: '2', limit: '5' }, adapter)
    const out: { id: string }[] = await run(params)
    const env = listPage(out, params, 'zenvia')
    expect(env.data.map((r) => r.id)).toEqual(range(10).slice(5))
    expect(env.meta.hasMore).toBe(true)
  })

  it('does not reuse a cursor recorded at another limit', async () => {
    handler = paged(rows(30))
    await run(withPageSink({ page: 1, limit: 5 }))
    const second = await run(withPageSink({ page: 2, limit: 7 }))
    // Page 2 at limit 7 is rows 8..14, never the continuation of the limit-5 walk.
    expect(calls.some((c) => c.params['limit'] === 7 && c.params['before'] === range(5)[4])).toBe(
      false,
    )
    expect(second.map((r) => r.id)).toEqual(range(14).slice(7))
  })

  it('keeps the two cursor collections apart on one connection', async () => {
    const other = path === '/prospects' ? '/prospects/interactions' : '/prospects'
    const byPath: Record<string, { id: string }[]> = {
      '/prospects': range(12).map((id) => ({ id: `p${id}` })),
      '/prospects/interactions': range(12).map((id) => ({ id: `i${id}` })),
    }
    handler = (p, params) => paged(byPath[p] ?? [])(p, params)
    // Page 1 of the OTHER collection records a cursor first.
    if (other === '/prospects')
      await adapter.listContacts(creds, withPageSink({ page: 1, limit: 5 }))
    else await adapter.listTickets(creds, withPageSink({ page: 1, limit: 5 }))
    const second = await run(withPageSink({ page: 2, limit: 5 }))
    const prefix = path === '/prospects' ? 'p' : 'i'
    for (const c of calls.filter((x) => x.path === path)) {
      const before = c.params['before']
      if (before !== undefined) expect(String(before).startsWith(prefix)).toBe(true)
    }
    expect(second.map((r) => r.id)).toEqual(
      range(10)
        .slice(5)
        .map((id) => `${prefix}${id}`),
    )
  })

  it('keeps two API keys apart', async () => {
    const b: Credentials = { accessToken: 'key-b' }
    const byKey: Record<string, { id: string }[]> = {
      'key-a': range(12).map((id) => ({ id: `a${id}` })),
      'key-b': range(12).map((id) => ({ id: `b${id}` })),
    }
    handler = (p, params) => paged(byKey[String(params['api-key'])] ?? [])(p, params)
    await run(withPageSink({ page: 1, limit: 5 }))
    const second =
      path === '/prospects'
        ? await adapter.listContacts(b, withPageSink({ page: 2, limit: 5 }))
        : await adapter.listTickets(b, withPageSink({ page: 2, limit: 5 }))
    expect(second.map((r) => r.id)).toEqual(
      range(10)
        .slice(5)
        .map((id) => `b${id}`),
    )
  })
})

const localCases = [
  {
    name: 'listUsers',
    path: '/agents',
    run: (p: QueryParams) => adapter.listUsers(creds, p),
  },
  {
    name: 'listTeams',
    path: '/groups',
    run: (p: QueryParams) => adapter.listTeams(creds, p),
  },
  {
    name: 'listMessages',
    path: '/prospect/p1/interactions',
    run: (p: QueryParams) => adapter.listMessages(creds, 'p1', p),
  },
] as const

describe.each(localCases)('zenvia $name paging (unpaginated upstream)', ({ path, run }) => {
  const rows = (n: number) => range(n).map((id) => ({ id, name: id, via: 'email' }))

  it('slices the whole list locally: every row once, in order, hasMore exact', async () => {
    const L = 5
    handler = () => rows(2 * L + 1)
    const { ids, hasMore, reported } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(reported).toEqual([true, true, false])
    expect(calls.every((c) => c.path === path)).toBe(true)
    // No undocumented paging parameter goes upstream.
    for (const c of calls) expect(Object.keys(c.params)).toEqual(['api-key'])
  })

  it('serves page 2 through parseListQuery and listPage', async () => {
    handler = () => rows(12)
    const params = parseListQuery({ page: '2', limit: '5' }, adapter)
    const out: { id: string }[] = await run(params)
    const env = listPage(out, params, 'zenvia')
    expect(env.data.map((r) => r.id)).toEqual(range(10).slice(5))
    expect(env.meta.hasMore).toBe(true)
    expect(env.meta.totalCount).toBe(12)
  })
})
