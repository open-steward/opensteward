/**
 * HelpDesk (hellotars-support) list paging.
 *
 * The HelpDesk API reference (https://api.helpdesk.com/docs, the Tickets tag):
 *
 *   "The `/v1/tickets` endpoint provides **cursor-based pagination**"
 *   "| `pageSize`     | number   | Number of results per page (default = 20, max = 100)"
 *   "| `next.value`   | string   | ISO 8601 timestamp for the last item on the current page"
 *   "| `next.ID`      | UUID     | ID of the last item on the current page"
 *
 * The response is a bare array with no next link, so the cursor is built from
 * the last row (its `createdAt`, the default `sortBy`, and its `ID`), and the
 * end is a page shorter than `pageSize`.
 *
 * `GET /v1/agents`, `/v1/tags` and `/v1/teams` take no query parameters in
 * the same spec ("A JSON Array of agents" / tags / teams): each returns the
 * whole collection, so the adapter pages it locally.
 *
 * The fake honours ONLY the documented parameters: `pageSize` (default 20,
 * max 100), `next.value` and `next.ID` on /tickets; nothing on the others.
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
  type PageMaxBearing,
} from '@opensteward/shared'
import { HellotarsSupportAdapter } from '../../../../../../src/verticals/customer-support/adapters/hellotars-support/index'

const creds: Credentials = {
  accessToken: 'at',
  refreshToken: 'rt',
  extra: { accountId: 'acc-1', organizationId: 'org-1' },
}

interface Call {
  token: string
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let collections: Record<string, Array<Record<string, unknown>>> = {}

/**
 * Row i is created one minute before row i-1: the default `createdAt desc`
 * order. `updatedAt` runs the other way, so a cursor built from the wrong
 * field sends a value no row of the documented sort matches.
 */
function ticketRows(n: number, prefix = 't'): Array<Record<string, unknown>> {
  const base = Date.parse('2026-01-15T12:00:00.000Z')
  return Array.from({ length: n }, (_, i) => ({
    ID: `${prefix}${i}`,
    subject: `s${i}`,
    status: 'open',
    createdAt: new Date(base - i * 60_000).toISOString(),
    updatedAt: new Date(base + 86_400_000 + i * 60_000).toISOString(),
  }))
}

/** Collections for a connection other than `creds` live under `<token>|<path>`. */
function collectionKey(token: string, path: string): string {
  return token === 'at' ? path : `${token}|${path}`
}

function fakeTickets(
  params: Record<string, unknown>,
  token: string,
): Array<Record<string, unknown>> {
  const all = collections[collectionKey(token, '/tickets')] ?? []
  const size = Math.min(params['pageSize'] === undefined ? 20 : Number(params['pageSize']), 100)
  let rest = all
  const value = params['next.value']
  const id = params['next.ID']
  if (value !== undefined || id !== undefined) {
    const at = Date.parse(String(value))
    rest = all.filter((r) => {
      const t = Date.parse(String(r['createdAt']))
      return t < at || (t === at && String(r['ID']) < String(id))
    })
  }
  return rest.slice(0, size)
}

/** GET /v1/tickets/{ticketID} responses (TicketResult, with its `events`). */
let ticketsById: Record<string, Record<string, unknown>> = {}

beforeEach(() => {
  calls = []
  collections = {}
  ticketsById = {}
  _resetCursorPager()
  vi.spyOn(axios, 'create').mockImplementation((createCfg) => {
    const headers = (createCfg?.headers ?? {}) as Record<string, unknown>
    const auth = String(headers['Authorization'] ?? '')
    const token = auth.replace(/^Bearer /, '')
    return {
      get: async (path: string, cfg?: { params?: Record<string, unknown> }) => {
        const params = { ...(cfg?.params ?? {}) }
        calls.push({ token, path, params })
        if (path === '/tickets') return { data: fakeTickets(params, token) }
        if (path.startsWith('/tickets/')) {
          // GET /v1/tickets/{ticketID} documents no query parameters.
          if (Object.keys(params).length > 0) throw new Error(`undocumented params on ${path}`)
          const ticket = ticketsById[decodeURIComponent(path.slice('/tickets/'.length))]
          if (!ticket) throw Object.assign(new Error('Not Found'), { response: { status: 404 } })
          return { data: ticket }
        }
        const all = collections[collectionKey(token, path)]
        if (!all) throw new Error(`unexpected path ${path}`)
        return { data: all }
      },
    } as unknown as ReturnType<typeof axios.create>
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const adapter = new HellotarsSupportAdapter({
  clientId: 'cid',
  clientSecret: 'secret',
  redirectUri: 'https://example.test/cb',
})

const L = 3
const N = 2 * L + 1

async function walk(
  list: (p: QueryParams) => Promise<Array<{ id: string }>>,
  limit: number = L,
): Promise<{ seen: string[]; hasMore: Array<boolean | undefined> }> {
  const seen: string[] = []
  const hasMore: Array<boolean | undefined> = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const got = await list(params)
    seen.push(...got.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, hasMore }
}

describe('HellotarsSupportAdapter.listTickets pages by the next.value / next.ID cursor', () => {
  const list = (p: QueryParams) => adapter.listTickets(creds, p)

  beforeEach(() => {
    collections['/tickets'] = ticketRows(N)
  })

  it('serves every row once, in order, across pages 1..3 with hasMore exact', async () => {
    const { seen, hasMore } = await walk(list)
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `t${i}`))
    expect(hasMore).toEqual([true, true, false])
  })

  it('serves every row once across upstream cursor pages at limit 100 (N = 201)', async () => {
    const LL = 100
    collections['/tickets'] = ticketRows(2 * LL + 1)
    const { seen, hasMore } = await walk(list, LL)
    expect(seen).toEqual(Array.from({ length: 2 * LL + 1 }, (_, i) => `t${i}`))
    expect(hasMore).toEqual([true, true, false])
  })

  it('carries next.value and next.ID of the last row of upstream page 1 on the page-2 request', async () => {
    const LL = 100
    collections['/tickets'] = ticketRows(2 * LL + 1)
    await list(withPageSink({ page: 2, limit: LL }))
    // A cold page 2 walks page 1 first; calls[1] is the request for upstream
    // page 2 (a peek at page 3 follows, since page 2 ends on its boundary).
    expect(calls[0]!.params['next.ID']).toBeUndefined()
    const page2Req = calls[1]!
    expect(page2Req.path).toBe('/tickets')
    expect(page2Req.params['pageSize']).toBe(100)
    expect(page2Req.params['next.ID']).toBe(`t${LL - 1}`)
    expect(page2Req.params['next.value']).toBe(collections['/tickets']![LL - 1]!['createdAt'])
    expect(page2Req.params['next']).toBeUndefined()
  })

  it('cuts small caller pages out of one 100-row upstream page', async () => {
    await walk(list)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params).toEqual({ pageSize: 100 })
  })

  it('clamps a limit above the documented maximum of 100 and still serves the caller page', async () => {
    collections['/tickets'] = ticketRows(250)
    const params = withPageSink({ page: 1, limit: 500 })
    const got = await list(params)
    expect(got.map((r) => r.id)).toEqual(Array.from({ length: 250 }, (_, i) => `t${i}`))
    expect(calls.map((c) => c.params['pageSize'])).toEqual([100, 100, 100])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('keeps one cursor walk per connection: two connections interleaved never share rows', async () => {
    const LL = 100
    const other: Credentials = {
      accessToken: 'at-2',
      refreshToken: 'rt-2',
      extra: { accountId: 'acc-2', organizationId: 'org-2' },
    }
    collections['/tickets'] = ticketRows(2 * LL + 1, 'a')
    collections[collectionKey('at-2', '/tickets')] = ticketRows(2 * LL + 1, 'b')
    const seenA: string[] = []
    const seenB: string[] = []
    for (const page of [1, 2, 3]) {
      seenA.push(
        ...(await adapter.listTickets(creds, withPageSink({ page, limit: LL }))).map((r) => r.id),
      )
      seenB.push(
        ...(await adapter.listTickets(other, withPageSink({ page, limit: LL }))).map((r) => r.id),
      )
    }
    expect(seenA).toEqual(Array.from({ length: 2 * LL + 1 }, (_, i) => `a${i}`))
    expect(seenB).toEqual(Array.from({ length: 2 * LL + 1 }, (_, i) => `b${i}`))
    // Each connection's cursor requests were built from its own rows.
    const cursorCalls = calls.filter((c) => c.params['next.ID'] !== undefined)
    expect(cursorCalls.length).toBeGreaterThan(0)
    for (const c of cursorCalls) {
      expect(String(c.params['next.ID'])[0]).toBe(c.token === 'at' ? 'a' : 'b')
    }
  })

  it('serves the adapter default of 50 rows when the caller sends no limit', async () => {
    collections['/tickets'] = ticketRows(120)
    const params = withPageSink({ page: 1 })
    const got = await list(params)
    expect(got.map((r) => r.id)).toEqual(Array.from({ length: 50 }, (_, i) => `t${i}`))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('serves pages 2 and 3 through parseListQuery and listPage on the API path', async () => {
    const p2 = parseListQuery({ page: '2', limit: String(L) }, adapter as PageMaxBearing)
    const env2 = listPage(await list(p2), p2, 'hellotars-support')
    expect(env2.data.map((r) => r.id)).toEqual(['t3', 't4', 't5'])
    expect(env2.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ page: '3', limit: String(L) }, adapter as PageMaxBearing)
    const env3 = listPage(await list(p3), p3, 'hellotars-support')
    expect(env3.data.map((r) => r.id)).toEqual(['t6'])
    expect(env3.meta.hasMore).toBe(false)
  })
})

const WHOLE: Array<{
  name: string
  path: string
  list: (p: QueryParams) => Promise<Array<{ id: string }>>
  row: (i: number) => Record<string, unknown>
}> = [
  {
    name: 'listUsers',
    path: '/agents',
    list: (p) => adapter.listUsers(creds, p),
    row: (i) => ({ ID: `r${i}`, name: `Agent ${i}`, email: `a${i}@example.test` }),
  },
  {
    name: 'listTags',
    path: '/tags',
    list: (p) => adapter.listTags(creds, p),
    row: (i) => ({ ID: `r${i}`, name: `tag${i}` }),
  },
  {
    name: 'listTeams',
    path: '/teams',
    list: (p) => adapter.listTeams(creds, p),
    row: (i) => ({ ID: `r${i}`, name: `Team ${i}` }),
  },
]

describe.each(WHOLE)('HellotarsSupportAdapter.$name pages the whole collection locally', (m) => {
  beforeEach(() => {
    collections[m.path] = Array.from({ length: N }, (_, i) => m.row(i))
  })

  it('serves every row once, in order, across pages 1..3 with hasMore exact', async () => {
    const { seen, hasMore } = await walk(m.list)
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `r${i}`))
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends no paging parameters: the endpoint documents none', async () => {
    await m.list(withPageSink({ page: 2, limit: L }))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe(m.path)
    expect(calls[0]!.params).toEqual({})
  })

  it('serves page 3 through parseListQuery and listPage on the API path', async () => {
    const p3 = parseListQuery({ page: '3', limit: String(L) }, adapter as PageMaxBearing)
    const env3 = listPage(await m.list(p3), p3, 'hellotars-support')
    expect(env3.data.map((r) => r.id)).toEqual(['r6'])
    expect(env3.meta.hasMore).toBe(false)
  })
})

/**
 * GET /v1/tickets/{ticketID} ("Get ticket") returns TicketResult, whose
 * `events` ("Ticket events") hold the ticket's messages as `type: "message"`
 * (and `followUpSent`) events next to status, tags, assignment ... events.
 * Message i is interleaved with a status event so the filter is exercised.
 */
function ticketWithEvents(ticketId: string, messages: number): Record<string, unknown> {
  const base = Date.parse('2026-01-15T12:00:00.000Z')
  const events: Array<Record<string, unknown>> = []
  for (let i = 0; i < messages; i++) {
    events.push({
      ID: `s${i}`,
      type: 'status',
      date: new Date(base + i * 60_000).toISOString(),
      author: { type: 'system', ID: 'sys' },
      status: { new: 'open', old: 'pending' },
    })
    events.push({
      ID: `m${i}`,
      type: 'message',
      date: new Date(base + i * 60_000 + 1000).toISOString(),
      author: { type: 'agent', ID: 'agent-1', name: 'John Agent' },
      source: { type: 'email' },
      message: { isPrivate: false, text: `body ${i}` },
    })
  }
  return { ID: ticketId, subject: 'Order', status: 'open', events }
}

describe('HellotarsSupportAdapter.listMessages reads the message events of GET /v1/tickets/{ticketID}', () => {
  const list = (p: QueryParams) => adapter.listMessages(creds, 'tk-1', p)

  beforeEach(() => {
    ticketsById['tk-1'] = ticketWithEvents('tk-1', N)
  })

  it('serves every message event once, in order, across pages 1..3 with hasMore exact', async () => {
    const { seen, hasMore } = await walk(list)
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `tk-1:m${i}`))
    expect(hasMore).toEqual([true, true, false])
  })

  it('calls only the documented ticket path, with no query parameters', async () => {
    await list(withPageSink({ page: 2, limit: L }))
    expect(calls).toEqual([{ token: 'at', path: '/tickets/tk-1', params: {} }])
    expect(calls.some((c) => c.path.includes('transactions'))).toBe(false)
  })

  it('serves page 3 through parseListQuery and listPage on the API path', async () => {
    const p3 = parseListQuery({ page: '3', limit: String(L) }, adapter as PageMaxBearing)
    const env3 = listPage(await list(p3), p3, 'hellotars-support')
    expect(env3.data.map((r) => r.id)).toEqual([`tk-1:m${N - 1}`])
    expect(env3.meta.hasMore).toBe(false)
  })

  it('returns an empty page for a ticket with no events', async () => {
    ticketsById['tk-2'] = { ID: 'tk-2', subject: 'x', status: 'open', events: [] }
    const params = withPageSink({ page: 1, limit: L })
    expect(await adapter.listMessages(creds, 'tk-2', params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  // TicketResult lists `events` as a property but marks nothing required, so a
  // ticket read without the key is a ticket with no events, not an error.
  it('returns an empty page when the ticket omits the optional events property', async () => {
    ticketsById['tk-3'] = { ID: 'tk-3', subject: 'x', status: 'open' }
    const params = withPageSink({ page: 1, limit: L })
    expect(await adapter.listMessages(creds, 'tk-3', params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('HellotarsSupportAdapter.getMessage reads the event back from its ticket', () => {
  beforeEach(() => {
    ticketsById['tk-1'] = ticketWithEvents('tk-1', 3)
  })

  it('returns the message a list served, by its ticketID:eventID id', async () => {
    const [first] = await adapter.listMessages(creds, 'tk-1', withPageSink({ page: 1, limit: 1 }))
    calls = []
    const msg = await adapter.getMessage(creds, first!.id)
    expect(msg.id).toBe('tk-1:m0')
    expect(msg.body).toBe('body 0')
    expect(calls).toEqual([{ token: 'at', path: '/tickets/tk-1', params: {} }])
  })

  it('404s for an id that names a non-message event of the ticket', async () => {
    await expect(adapter.getMessage(creds, 'tk-1:s0')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects an id without a ticket part and sends no request', async () => {
    await expect(adapter.getMessage(creds, 'm0')).rejects.toMatchObject({ statusCode: 400 })
    expect(calls).toEqual([])
  })
})

describe('HellotarsSupportAdapter page size', () => {
  it('declares no maxPageSize: every list serves any limit (pageByRows or a whole collection)', () => {
    expect(
      (adapter as { capabilities?: { maxPageSize?: number } }).capabilities?.maxPageSize,
    ).toBeUndefined()
  })
})
