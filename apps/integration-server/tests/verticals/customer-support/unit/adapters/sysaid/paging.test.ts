/**
 * SysAid list paging: tickets, messages, contacts, users and teams.
 *
 * SysAid's Connect API v1 pages every list by `offset` and `limit`:
 *
 * - GET /service-records/search (https://developers.sysaid.com/reference/searchservicerecords):
 *   `limit` is "The maximum number of SRs to retrieve per request. Defaults to
 *   100 results (configurable)." with schema maximum 100; `offset` "specifies
 *   the offset (start point) from which to retrieve values (e.g. 25). Defaults
 *   to 0." The 200 response is a bare array of service records, so the end is
 *   a short page.
 * - GET /end-users, /agents, /groups and /activities/sr/search: `limit` "up to
 *   500" (default 20) and `offset` "Calculated as `(page - 1) * limit` (page
 *   starts at 1)."; the response carries `total`, "The total number of
 *   elements across all pages.", beside `data`.
 *
 * The fakes below honour ONLY those parameters, with those defaults and caps.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { SysaidAdapter } from '../../../../../../src/verticals/customer-support/adapters/sysaid/index'

const creds: Credentials = {
  accessToken: 'token',
  extra: { accountId: 'acme' },
}

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let handler: (path: string, params: Record<string, unknown>) => unknown

beforeEach(() => {
  calls = []
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

function window(n: number, params: Record<string, unknown>, def: number, max: number) {
  const offset = Number(params['offset'] ?? 0)
  const limit = Math.min(Number(params['limit'] ?? def), max)
  const ids = Array.from({ length: n }, (_, i) => i + 1)
  return { offset, limit, rows: ids.slice(offset, offset + limit) }
}

/** /service-records/search: bare array, limit default 100, maximum 100. */
const serviceRecords = (n: number) => (_path: string, params: Record<string, unknown>) =>
  window(n, params, 100, 100).rows.map((id) => ({ id, title: `SR ${id}` }))

/** The Pagination envelope of /end-users, /agents, /groups, /activities/sr/search. */
const enveloped = (n: number) => (_path: string, params: Record<string, unknown>) => {
  const { offset, limit, rows } = window(n, params, 20, 500)
  return { limit, offset, total: n, data: rows.map((id) => ({ id, name: `Row ${id}` })) }
}

async function walk(run: (p: QueryParams) => Promise<{ id: string }[]>, limit: number) {
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  const reported: (boolean | undefined)[] = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    ids.push(...rows.map((r) => r.id))
    reported.push(readUpstreamPage(params)?.hasMore)
    hasMore.push(listPage(rows, params, 'sysaid').meta.hasMore ?? undefined)
  }
  return { ids, hasMore, reported }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))

const cases = [
  {
    name: 'listTickets',
    path: '/service-records/search',
    fake: serviceRecords,
    extra: {},
    max: 100,
    run: (a: SysaidAdapter, p: QueryParams) => a.listTickets(creds, p),
  },
  {
    name: 'listMessages',
    path: '/activities/sr/search',
    fake: enveloped,
    extra: { srIds: '42' },
    max: 500,
    run: (a: SysaidAdapter, p: QueryParams) => a.listMessages(creds, '42', p),
  },
  {
    name: 'listContacts',
    path: '/end-users',
    fake: enveloped,
    extra: {},
    max: 500,
    run: (a: SysaidAdapter, p: QueryParams) => a.listContacts(creds, p),
  },
  {
    name: 'listUsers',
    path: '/agents',
    fake: enveloped,
    extra: { expand: 'groups' },
    max: 500,
    run: (a: SysaidAdapter, p: QueryParams) => a.listUsers(creds, p),
  },
  {
    name: 'listTeams',
    path: '/groups',
    fake: enveloped,
    extra: {},
    max: 500,
    run: (a: SysaidAdapter, p: QueryParams) => a.listTeams(creds, p),
  },
] as const

describe.each(cases)('sysaid $name paging', ({ path, fake, extra, max, run: runWith }) => {
  const adapter = new SysaidAdapter()
  const run = (p: QueryParams): Promise<{ id: string }[]> => runWith(adapter, p)

  it('serves every row once, in order, across pages of 2L+1 rows', async () => {
    const L = 5
    handler = fake(2 * L + 1)
    const { ids, hasMore, reported } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    // The sync worker reads only the reported flag, so pin it on its own.
    expect(reported).toEqual([true, true, false])
  })

  it('page 2 requests the documented offset and limit', async () => {
    handler = fake(30)
    await run(withPageSink({ page: 2, limit: 7 }))
    expect(calls).toEqual([{ path, params: { ...extra, limit: 7, offset: 7 } }])
  })

  it('a limit above the maximum is clamped', async () => {
    handler = fake(600)
    const params = parseListQuery({ limit: '9999' })
    const rows = await run(params)
    expect(calls).toEqual([{ path, params: { ...extra, limit: max, offset: 0 } }])
    expect(rows.map((r) => r.id)).toEqual(range(max))
    expect(listPage(rows, params, 'sysaid').meta.hasMore).toBe(true)
  })

  it('page 2 past the maximum strides by the size it asked for', async () => {
    handler = fake(2 * max + 1)
    const params = withPageSink({ page: 2, limit: 500 })
    const rows = await run(params)
    expect(calls).toEqual([{ path, params: { ...extra, limit: max, offset: max } }])
    expect(rows.map((r) => r.id)).toEqual(range(2 * max).slice(max))
  })

  it('an exact multiple of the limit ends where the documented total says', async () => {
    const L = 5
    handler = fake(2 * L)
    const totals: (number | undefined)[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: L })
      await run(params)
      totals.push(readUpstreamPage(params)?.totalCount)
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    if (fake === enveloped) {
      // `total` is "The total number of elements across all pages."
      expect(hasMore).toEqual([true, false])
      expect(totals).toEqual([2 * L, 2 * L])
    } else {
      // A bare array documents no total: a full page can only mean "maybe more".
      expect(hasMore).toEqual([true, true])
      expect(totals).toEqual([undefined, undefined])
    }
  })

  it('reports the page size it sent when the maximum clamps the caller', async () => {
    handler = fake(2 * max + 1)
    const params = withPageSink({ page: 1, limit: 500 })
    await run(params)
    expect(readUpstreamPage(params)?.pageSize).toBe(max < 500 ? max : undefined)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    handler = fake(41)
    const params = parseListQuery({ page: '2', limit: '20' })
    const env = listPage(await run(params), params, 'sysaid')
    expect(env.data.map((r) => r.id)).toEqual(range(40).slice(20))
    expect(env.meta.hasMore).toBe(true)
  })
})
