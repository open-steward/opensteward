/**
 * Jira Service Management list paging.
 *
 * From https://developer.atlassian.com/cloud/jira/service-desk/swagger.v3.json
 * (getCustomerRequests, getRequestComments, getServiceDesks, getCustomers):
 *
 *   start: "The starting index of the returned objects. Base index: 0."
 *   limit: "The maximum number of items to return per page. Default: 50."
 *   isLastPage: "Indicates if this is the last page of records (true) or not (false)."
 *
 * From https://developer.atlassian.com/cloud/jira/service-desk/rest/intro/ (Pagination):
 *
 *   "Each resource or method has a unique limit on the maximum number of items
 *   returned, which cannot be exceeded. If you request `size` which is larger than
 *   the limit, the number of items returned will be capped at the limit for that
 *   resource's method."
 *
 * So a page can hold fewer rows than asked for while more remain: the adapter
 * advances `start` by the rows actually returned and walks with pageByRows. The fake
 * caps every Service Desk page at SD_CAP rows to hold it to that.
 *
 * From https://developer.atlassian.com/cloud/jira/platform/swagger-v3.v3.json
 * (GET /rest/api/3/users/search, a plain array):
 *
 *   startAt:    "The index of the first item to return."
 *   maxResults: "The maximum number of items to return (limited to 1000)."
 *
 * The adapter keeps only atlassian accounts, so a caller page is a filtered upstream
 * page and is cut out of the row stream too.
 *
 * The fake honours ONLY those parameters and refuses any other.
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
import { JiraServiceManagementAdapter } from '../../../../../../src/verticals/customer-support/adapters/jira-service-management/index'

const creds: Credentials = {
  accessToken: 'jsm_test',
  refreshToken: 'jsm_refresh',
  extra: { cloudId: 'cloud-1' },
}

interface Call {
  api: 'sd' | 'jira'
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
/** Rows in the collection under test (requests, comments, desks, users). */
let total = 0
/** Customers on each service desk. */
let perDesk = 0
/** The per-method maximum JSM applies to `limit` ("an implementation detail"). */
let SD_CAP = 3
/** Rows /users/search returns at most, whatever maxResults says (a short page mid-stream). */
let USERS_CAP = Infinity
/** Leave isLastPage out of every Service Desk page, so only an empty page ends a chain. */
let omitLastPage = false
/** A service desk whose customers call fails, as for a desk the connection cannot read. */
let failingDesk: string | null = null
/** Accept the adapter's `query` pass-through on /users/search (off: it is not in the spec). */
let allowUserQuery = false

function only(path: string, params: Record<string, unknown>, allowed: string[]): void {
  for (const k of Object.keys(params)) {
    if (!allowed.includes(k)) throw new Error(`undocumented param ${k} on ${path}`)
  }
}

/** One JSM PagedDTO over `rows`, honouring start/limit and the per-method cap. */
function paged<T>(rows: T[], params: Record<string, unknown>) {
  const start = Number(params['start'] ?? 0)
  const limit = Math.min(Number(params['limit'] ?? 50), SD_CAP)
  const values = rows.slice(start, start + limit)
  if (omitLastPage) return { start, limit, size: values.length, values }
  return {
    start,
    limit,
    size: values.length,
    isLastPage: start + values.length >= rows.length,
    values,
  }
}

const seq = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

/**
 * `tag` is '' for `creds` and 'b-' for any other token, so a row that reaches the
 * wrong connection shows up in its id.
 */
function sd(path: string, params: Record<string, unknown>, tag: string): unknown {
  if (path === '/request') {
    only(path, params, ['start', 'limit'])
    return paged(
      seq(total).map((i) => ({ issueId: `${tag}${i}`, issueKey: `IT-${i}` })),
      params,
    )
  }
  const comments = /^\/request\/([^/]+)\/comment$/.exec(path)
  if (comments) {
    only(path, params, ['start', 'limit', 'public', 'internal'])
    // Ticket IT-7's comments are ids 1..n; any other ticket's carry its key.
    const ticket = comments[1]!
    const prefix = ticket === 'IT-7' ? '' : `${ticket}:`
    return paged(
      seq(total).map((i) => ({ id: `${prefix}${i}`, body: `c${i}` })),
      params,
    )
  }
  if (path === '/servicedesk') {
    only(path, params, ['start', 'limit'])
    return paged(
      seq(total).map((i) => ({ id: String(i), projectName: `Desk ${i}` })),
      params,
    )
  }
  const m = /^\/servicedesk\/(\d+)\/customer$/.exec(path)
  if (m) {
    only(path, params, ['start', 'limit', 'query'])
    const desk = m[1]!
    if (desk === failingDesk) throw new Error(`no access to service desk ${desk}`)
    return paged(
      seq(perDesk).map((i) => ({ accountId: `d${desk}-c${i}`, displayName: `C ${i}` })),
      params,
    )
  }
  throw new Error(`unexpected sd path ${path}`)
}

/** Every third user is an app account, which the adapter leaves out. */
const allUsers = () =>
  seq(total).map((i) => ({ accountId: `u${i}`, accountType: i % 3 === 0 ? 'app' : 'atlassian' }))
const keptUserIds = () =>
  allUsers()
    .filter((u) => u.accountType === 'atlassian')
    .map((u) => u.accountId)

function jira(path: string, params: Record<string, unknown>): unknown {
  if (path === '/users/search') {
    const allowed = ['startAt', 'maxResults']
    if (allowUserQuery) allowed.push('query')
    only(path, params, allowed)
    const startAt = Number(params['startAt'] ?? 0)
    const maxResults = Number(params['maxResults'] ?? 50)
    if (maxResults > 1000) throw new Error('maxResults is limited to 1000')
    const q = params['query'] === undefined ? '' : `${String(params['query'])}:`
    return allUsers()
      .map((u) => ({ ...u, accountId: `${q}${u.accountId}` }))
      .slice(startAt, startAt + Math.min(maxResults, USERS_CAP))
  }
  throw new Error(`unexpected jira path ${path}`)
}

beforeEach(() => {
  calls = []
  total = 0
  perDesk = 0
  SD_CAP = 3
  USERS_CAP = Infinity
  omitLastPage = false
  failingDesk = null
  allowUserQuery = false
  _resetRowPager()
  vi.spyOn(axios, 'create').mockImplementation((cfg) => {
    const api = String(cfg?.baseURL).includes('/servicedeskapi') ? 'sd' : 'jira'
    const auth = String((cfg?.headers as Record<string, unknown> | undefined)?.['Authorization'])
    const tag = auth === `Bearer ${creds.accessToken}` ? '' : 'b-'
    return {
      get: async (path: string, c?: { params?: Record<string, unknown> }) => {
        const params = { ...(c?.params ?? {}) }
        calls.push({ api, path, params })
        return { data: api === 'sd' ? sd(path, params, tag) : jira(path, params) }
      },
    } as unknown as ReturnType<typeof axios.create>
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const adapter = new JiraServiceManagementAdapter({
  clientId: 'id',
  clientSecret: 'secret',
  redirectUri: 'https://example.test/cb',
})

async function walk(run: (p: QueryParams) => Promise<Array<{ id: string }>>, limit: number) {
  const seen: string[] = []
  const reported: Array<boolean | undefined> = []
  const meta: Array<boolean | null | undefined> = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    seen.push(...rows.map((r) => r.id))
    reported.push(readUpstreamPage(params)?.hasMore)
    meta.push(listPage(rows, params, 'jira-service-management').meta.hasMore)
  }
  return { seen, reported, meta }
}

const offsetMethods: {
  name: string
  path: string
  run: (p: QueryParams) => Promise<Array<{ id: string }>>
}[] = [
  { name: 'listTickets', path: '/request', run: (p) => adapter.listTickets(creds, p) },
  {
    name: 'listMessages',
    path: '/request/IT-7/comment',
    run: (p) => adapter.listMessages(creds, 'IT-7', p),
  },
  { name: 'listTeams', path: '/servicedesk', run: (p) => adapter.listTeams(creds, p) },
  {
    name: 'listContacts (one service desk)',
    path: '/servicedesk/5/customer',
    // The page sink is keyed on the params object, so the filter is set on it, not on a copy.
    run: (p) => adapter.listContacts(creds, Object.assign(p, { serviceDeskId: '5' })),
  },
]

const expectedIds = (name: string) =>
  name.startsWith('listContacts') ? seq(perDesk).map((i) => `d5-c${i}`) : seq(total).map(String)

for (const { name, path, run } of offsetMethods) {
  describe(`jira-service-management ${name} pages by start + limit`, () => {
    const setTotal = (n: number) => {
      total = n
      perDesk = n
    }

    it('serves 2L+1 rows once, in order, over pages 1..3, with hasMore exact', async () => {
      const L = 4
      setTotal(2 * L + 1)
      const { seen, reported, meta } = await walk(run, L)
      expect(seen).toEqual(expectedIds(name))
      expect(reported).toEqual([true, true, false])
      expect(meta).toEqual([true, true, false])
    })

    it('advances start by the rows JSM returned, not by the limit it was sent', async () => {
      // The per-method cap (3) is below the caller's limit: page 2 must start at row 4,
      // reached through start=3 then start=6, never by skipping to start=limit.
      setTotal(9)
      await walk(run, 4)
      const starts = calls.filter((c) => c.path === path).map((c) => c.params['start'])
      expect(starts).toEqual([0, 3, 6])
      for (const c of calls.filter((c) => c.path === path)) expect(c.params['limit']).toBe(50)
    })

    it('the page-2 request carries start', async () => {
      SD_CAP = 50
      setTotal(120)
      await run(withPageSink({ page: 2, limit: 50 }))
      // A fresh walk to page 2 reads the chain from the start (start=0, then start=50),
      // and peeks at start=100 because page 2 ends exactly on an upstream page.
      const starts = calls.filter((c) => c.path === path).map((c) => c.params['start'])
      expect(starts).toEqual([0, 50, 100])
    })

    it('a limit above the router cap is clamped', async () => {
      SD_CAP = 50
      setTotal(600)
      const params = parseListQuery({ limit: '9999' })
      expect(params.limit).toBe(500)
      const rows = await run(params)
      expect(rows).toHaveLength(500)
      expect(readUpstreamPage(params)?.hasMore).toBe(true)
    })

    it('API path: page 2 through parseListQuery and listPage', async () => {
      setTotal(9)
      const params = parseListQuery({ page: '2', limit: '4' })
      const env = listPage(await run(params), params, 'jira-service-management')
      expect(env.data.map((r) => r.id)).toEqual(expectedIds(name).slice(4, 8))
      expect(env.meta.hasMore).toBe(true)
    })
  })
}

describe('jira-service-management listContacts across every service desk', () => {
  const run = (p: QueryParams) => adapter.listContacts(creds, p)
  const allCustomers = () => seq(total).flatMap((d) => seq(perDesk).map((c) => `d${d}-c${c}`))

  it('serves 2L+1 customers once, in order, over pages 1..3, with hasMore exact', async () => {
    // 3 desks x 3 customers = 9 = 2L+1 at L=4, each desk paged at the cap of 2.
    SD_CAP = 2
    total = 3
    perDesk = 3
    const { seen, reported, meta } = await walk(run, 4)
    expect(seen).toEqual(allCustomers())
    expect(reported).toEqual([true, true, false])
    expect(meta).toEqual([true, true, false])
  })

  it('reaches desks past the first page of service desks', async () => {
    SD_CAP = 2
    total = 5
    perDesk = 1
    const params = parseListQuery({ page: '1', limit: '10' })
    const rows = await run(params)
    expect(rows.map((r) => r.id)).toEqual(allCustomers())
    const deskStarts = calls.filter((c) => c.path === '/servicedesk').map((c) => c.params['start'])
    expect(deskStarts).toEqual([0, 2, 4])
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    total = 3
    perDesk = 3
    const params = parseListQuery({ page: '2', limit: '4' })
    const env = listPage(await run(params), params, 'jira-service-management')
    expect(env.data.map((r) => r.id)).toEqual(allCustomers().slice(4, 8))
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('jira-service-management listUsers pages by startAt + maxResults', () => {
  const run = (p: QueryParams) => adapter.listUsers(creds, p)

  it('serves 2L+1 kept users once, in order, over pages 1..3, with hasMore exact', async () => {
    const L = 4
    // 13 accounts, of which u3, u6, u9, u12 are app accounts: 9 = 2L+1 kept.
    total = 13
    expect(keptUserIds()).toHaveLength(2 * L + 1)
    const { seen, reported, meta } = await walk(run, L)
    expect(seen).toEqual(keptUserIds())
    expect(reported).toEqual([true, true, false])
    expect(meta).toEqual([true, true, false])
  })

  it('the page-2 request carries startAt past the rows already read', async () => {
    total = 250
    await run(withPageSink({ page: 2, limit: 100 }))
    const starts = calls.filter((c) => c.path === '/users/search').map((c) => c.params['startAt'])
    expect(starts[0]).toBe(0)
    expect(starts[1]).toBe(100)
    for (const c of calls) expect(Number(c.params['maxResults'])).toBeLessThanOrEqual(1000)
  })

  it('a limit above the router cap is clamped', async () => {
    total = 1200
    const params = parseListQuery({ limit: '9999' })
    expect(params.limit).toBe(500)
    const rows = await run(params)
    expect(rows).toHaveLength(500)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    total = 13
    const params = parseListQuery({ page: '2', limit: '4' })
    const env = listPage(await run(params), params, 'jira-service-management')
    expect(env.data.map((r) => r.id)).toEqual(keptUserIds().slice(4, 8))
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('jira-service-management pager keys', () => {
  const other: Credentials = {
    accessToken: 'jsm_other',
    refreshToken: 'jsm_other_refresh',
    extra: { cloudId: 'cloud-1' },
  }

  it('two connections on one site never share remembered rows', async () => {
    // Connection A reads page 1, which leaves upstream rows 4..6 in the pager's slot.
    // Connection B on the same cloudId then asks for page 2: every row must be B's.
    total = 9
    await adapter.listTickets(creds, withPageSink({ page: 1, limit: 4 }))
    const rows = await adapter.listTickets(other, withPageSink({ page: 2, limit: 4 }))
    expect(rows.map((r) => r.id)).toEqual(['b-5', 'b-6', 'b-7', 'b-8'])
  })

  it("page 2 of one ticket's comments is never served from another ticket's walk", async () => {
    total = 9
    await adapter.listMessages(creds, 'IT-7', withPageSink({ page: 1, limit: 4 }))
    const rows = await adapter.listMessages(creds, 'IT-8', withPageSink({ page: 2, limit: 4 }))
    expect(rows.map((r) => r.id)).toEqual(['IT-8:5', 'IT-8:6', 'IT-8:7', 'IT-8:8'])
  })

  it("page 2 of one desk's customers is never served from another desk's walk", async () => {
    perDesk = 9
    await adapter.listContacts(
      creds,
      Object.assign(withPageSink({ page: 1, limit: 4 }), { serviceDeskId: '5' }),
    )
    const rows = await adapter.listContacts(
      creds,
      Object.assign(withPageSink({ page: 2, limit: 4 }), { serviceDeskId: '6' }),
    )
    expect(rows.map((r) => r.id)).toEqual(['d6-c5', 'd6-c6', 'd6-c7', 'd6-c8'])
  })

  it('listUsers keys each query separately', async () => {
    allowUserQuery = true
    total = 13
    await adapter.listUsers(
      creds,
      Object.assign(withPageSink({ page: 1, limit: 4 }), { query: 'a' }),
    )
    const rows = await adapter.listUsers(
      creds,
      Object.assign(withPageSink({ page: 2, limit: 4 }), { query: 'b' }),
    )
    expect(rows.map((r) => r.id)).toEqual(
      keptUserIds()
        .slice(4, 8)
        .map((id) => `b:${id}`),
    )
  })
})

describe('jira-service-management chain ends and failures', () => {
  it('listUsers advances startAt by the rows returned when a page is short mid-stream', async () => {
    // /users/search returns 7 rows although maxResults=100 was sent, and more remain.
    USERS_CAP = 7
    total = 20
    const params = parseListQuery({ page: '1', limit: '100' })
    const rows = await adapter.listUsers(creds, params)
    expect(rows.map((r) => r.id)).toEqual(keptUserIds())
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    const starts = calls.filter((c) => c.path === '/users/search').map((c) => c.params['startAt'])
    expect(starts).toEqual([0, 7, 14, 20])
  })

  it('a Service Desk page without isLastPage ends on the first empty page', async () => {
    omitLastPage = true
    total = 5
    const params = parseListQuery({ page: '1', limit: '10' })
    const rows = await adapter.listTickets(creds, params)
    expect(rows.map((r) => r.id)).toEqual(seq(5).map(String))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    const starts = calls.filter((c) => c.path === '/request').map((c) => c.params['start'])
    expect(starts).toEqual([0, 3, 5])
  })

  it('all-desks listContacts skips a desk it cannot read and carries on to the next', async () => {
    SD_CAP = 2
    total = 3
    perDesk = 2
    failingDesk = '2'
    const params = parseListQuery({ page: '1', limit: '10' })
    const rows = await adapter.listContacts(creds, params)
    expect(rows.map((r) => r.id)).toEqual(['d1-c1', 'd1-c2', 'd3-c1', 'd3-c2'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})
