/**
 * otobo — routes, request shape and paging of listTickets / getTicket /
 * listMessages against OTOBO's shipped GenericTicketConnectorREST.
 *
 * development/webservices/GenericTicketConnectorREST.yml (rel-11_0) routes
 *   TicketSearch: GET /Ticket
 *   TicketGet:    GET /Ticket/:TicketID
 * The adapter used to call /TicketSearch and /TicketGet/{id}, which that
 * connector does not route.
 *
 * TicketSearch has no offset: it reads `Limit` only
 * (`$Self->{SearchLimit} = $Param{Data}->{Limit} || $Self->{Config}->{SearchLimit} || 500;`)
 * and sorts by `SortBy`/`OrderBy`. So page N asks for the first N × limit
 * ids in TicketNumber order and serves ids [(N-1) × limit, N × limit); a short
 * result is the end (hasMore false, with the total). TicketGet takes
 * `TicketID => '32,33', # required, could be coma separated IDs`.
 *
 * The fake below talks HTTP-shaped: it sees the path and query the client
 * sends, honours only the documented parameters, and answers errors the way
 * Operation::Common::ReturnError does — HTTP 200 with an `Error` object.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'

interface Call {
  baseURL: string
  path: string
  params: Record<string, unknown>
}

const state = vi.hoisted(() => ({
  calls: [] as Array<{ baseURL: string; path: string; params: Record<string, unknown> }>,
  handler: (_path: string, _params: Record<string, unknown>): unknown => ({}),
}))

vi.mock('axios', () => {
  const create = (config: { baseURL: string }) => ({
    get: async (path: string, opts?: { params?: Record<string, unknown> }) => {
      const params = opts?.params ?? {}
      state.calls.push({ baseURL: config.baseURL, path, params })
      return { data: state.handler(path, params) }
    },
    post: async () => {
      throw new Error('no POST expected in read tests')
    },
  })
  return { default: { create } }
})

import { OtoboAdapter } from '../../../../../../src/verticals/customer-support/adapters/otobo/index'

const creds: Credentials = {
  accessToken: 'agent',
  extra: {
    password: 'secret',
    serverUrl: 'https://helpdesk.example.test',
    websvcName: 'GenericTicketConnectorREST',
  },
}

const DOCUMENTED_SEARCH_PARAMS = new Set(['UserLogin', 'Password', 'Limit', 'SortBy', 'OrderBy'])
const DOCUMENTED_GET_PARAMS = new Set(['UserLogin', 'Password', 'AllArticles'])

function ticket(id: number) {
  return {
    TicketID: id,
    TicketNumber: `2026010100${String(id).padStart(4, '0')}`,
    Title: `ticket ${id}`,
    State: 'open',
    StateType: 'open',
    Priority: '3 normal',
    CustomerUserID: 'customer_user_id_123',
    Created: '2010-10-27 20:15:00',
    Changed: '2010-10-27 20:15:15',
  }
}

function article(i: number) {
  return {
    ArticleID: 900 + i,
    From: 'Some Agent <email@example.com>',
    Subject: `subject ${i}`,
    Body: `body ${i}`,
    SenderType: 'agent',
    IsVisibleForCustomer: 1,
    IncomingTime: 1490690026 + i,
    MimeType: 'text/plain',
  }
}

/**
 * Fake OTOBO holding `count` tickets (ids 1..count, TicketNumber ascending
 * with id) and `articles` articles on ticket 1. TicketSearch returns the first
 * `Limit` ids (500 when absent — the SysConfig default); unknown query keys
 * make it fail, so an undocumented parameter cannot pass silently.
 */
function fakeOtobo(count: number, articles = 0) {
  const ids = Array.from({ length: count }, (_, i) => i + 1)
  state.handler = (path, params) => {
    if (params['UserLogin'] !== 'agent' || params['Password'] !== 'secret') {
      return {
        Error: { ErrorCode: 'TicketSearch.AuthFail', ErrorMessage: 'Authorization failing!' },
      }
    }
    if (path === '/Ticket') {
      for (const k of Object.keys(params)) {
        if (!DOCUMENTED_SEARCH_PARAMS.has(k))
          throw new Error(`undocumented TicketSearch param ${k}`)
      }
      expect(params['SortBy']).toBe('TicketNumber')
      expect(params['OrderBy']).toBe('Up')
      const limit = params['Limit'] === undefined ? 500 : Number(params['Limit'])
      const found = ids.slice(0, limit)
      return found.length ? { TicketID: found } : {}
    }
    const m = /^\/Ticket\/([^/]+)$/.exec(path)
    if (!m) throw new Error(`route not in GenericTicketConnectorREST: ${path}`)
    for (const k of Object.keys(params)) {
      if (!DOCUMENTED_GET_PARAMS.has(k)) throw new Error(`undocumented TicketGet param ${k}`)
    }
    // REST.pm uri_unescape()s route params; TicketGet then splits on commas.
    const wanted = decodeURIComponent(m[1]!).split(',').map(Number)
    if (wanted.some((id) => !ids.includes(id))) {
      return {
        Error: {
          ErrorCode: 'TicketGet.AccessDenied',
          ErrorMessage: 'User does not have access to the ticket!',
        },
      }
    }
    return {
      Ticket: wanted.map((id) => {
        const t: Record<string, unknown> = ticket(id)
        if (Number(params['AllArticles']) === 1 && id === 1 && articles > 0) {
          t['Article'] = Array.from({ length: articles }, (_, i) => article(i))
        }
        return t
      }),
    }
  }
}

function sink(p: QueryParams): QueryParams {
  return withPageSink({ ...p })
}

let adapter: OtoboAdapter
beforeEach(() => {
  state.calls.length = 0
  adapter = new OtoboAdapter({})
})

describe('otobo client', () => {
  it('uses the Webservice base URL and sends UserLogin/Password as query params', async () => {
    fakeOtobo(1)
    await adapter.getTicket(creds, '1')
    const call = state.calls[0] as Call
    expect(call.baseURL).toBe(
      'https://helpdesk.example.test/otobo/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST',
    )
    expect(call.path).toBe('/Ticket/1')
    expect(call.params).toMatchObject({ UserLogin: 'agent', Password: 'secret' })
  })

  it('throws on the HTTP-200 Error envelope instead of reading it as an empty result', async () => {
    fakeOtobo(3)
    const bad: Credentials = { ...creds, extra: { ...creds.extra, password: 'wrong' } }
    await expect(adapter.listTickets(bad, sink({ page: 1, limit: 2 }))).rejects.toMatchObject({
      statusCode: 401,
      code: 'TicketSearch.AuthFail',
    })
  })
})

describe('otobo listTickets', () => {
  it('calls TicketSearch on GET /Ticket, then one TicketGet with comma-separated ids', async () => {
    fakeOtobo(5)
    const rows = await adapter.listTickets(creds, sink({ page: 1, limit: 2 }))
    expect(rows.map((r) => r.id)).toEqual(['1', '2'])
    expect(state.calls.map((c) => c.path)).toEqual(['/Ticket', '/Ticket/1,2'])
    expect(state.calls[0]!.params).toMatchObject({
      Limit: 2,
      SortBy: 'TicketNumber',
      OrderBy: 'Up',
    })
  })

  it('walks N = 2L+1 tickets: every id once, hasMore exact', async () => {
    const L = 3
    const N = 2 * L + 1
    fakeOtobo(N)
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let page = 1; page <= 4; page++) {
      const params = sink({ page, limit: L })
      const rows = await adapter.listTickets(creds, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
    expect(new Set(seen).size).toBe(N)
    expect(hasMore).toEqual([true, true, false])
  })

  it('asks TicketSearch for the first page × limit ids: page 2 at limit 3 sends Limit 6', async () => {
    fakeOtobo(10)
    const rows = await adapter.listTickets(creds, sink({ page: 2, limit: 3 }))
    expect(rows.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(state.calls[0]!.params['Limit']).toBe(6)
    expect(state.calls[1]!.path).toBe('/Ticket/4,5,6')
  })

  it('at an exact page boundary a full window reports more, and the next page ends it', async () => {
    fakeOtobo(4)
    const p2 = sink({ page: 2, limit: 2 })
    expect((await adapter.listTickets(creds, p2)).map((r) => r.id)).toEqual(['3', '4'])
    expect(readUpstreamPage(p2)).toMatchObject({ hasMore: true })
    const p3 = sink({ page: 3, limit: 2 })
    expect(await adapter.listTickets(creds, p3)).toEqual([])
    expect(readUpstreamPage(p3)).toMatchObject({ hasMore: false, totalCount: 4 })
  })

  it('returns [] past the end without a TicketGet call', async () => {
    fakeOtobo(2)
    const p = sink({ page: 3, limit: 2 })
    expect(await adapter.listTickets(creds, p)).toEqual([])
    expect(state.calls.map((c) => c.path)).toEqual(['/Ticket'])
    expect(readUpstreamPage(p)).toMatchObject({ hasMore: false, totalCount: 2 })
  })

  it('treats an empty TicketSearch result (Data {}) as no tickets', async () => {
    fakeOtobo(0)
    const p = sink({ page: 1, limit: 10 })
    expect(await adapter.listTickets(creds, p)).toEqual([])
    expect(readUpstreamPage(p)).toMatchObject({ hasMore: false, totalCount: 0 })
  })
})

describe('otobo getTicket', () => {
  it('reads GET /Ticket/:TicketID', async () => {
    fakeOtobo(3)
    const t = await adapter.getTicket(creds, '2')
    expect(t.id).toBe('2')
    expect(state.calls.map((c) => c.path)).toEqual(['/Ticket/2'])
  })

  it('treats a response that is not exactly the ticket asked for as not found', async () => {
    fakeOtobo(3)
    // TicketGet splits TicketID on commas, so '1,2' would answer with two tickets
    await expect(adapter.getTicket(creds, '1,2')).rejects.toMatchObject({ statusCode: 404 })
    expect(state.calls[0]!.path).toBe('/Ticket/1%2C2')
  })

  it('surfaces TicketGet.AccessDenied as 403', async () => {
    fakeOtobo(3)
    await expect(adapter.getTicket(creds, '99')).rejects.toMatchObject({
      statusCode: 403,
      code: 'TicketGet.AccessDenied',
    })
  })
})

describe('otobo listMessages', () => {
  it('reads articles from GET /Ticket/:TicketID?AllArticles=1', async () => {
    fakeOtobo(1, 2)
    const rows = await adapter.listMessages(creds, '1', sink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(['900', '901'])
    expect(state.calls[0]!.path).toBe('/Ticket/1')
    expect(state.calls[0]!.params).toMatchObject({ AllArticles: 1 })
  })

  it('walks N = 2L+1 articles by local slices: every id once, hasMore exact', async () => {
    const L = 2
    const N = 2 * L + 1
    fakeOtobo(1, N)
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = sink({ page, limit: L })
      seen.push(...(await adapter.listMessages(creds, '1', params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(900 + i)))
    expect(hasMore).toEqual([true, true, false])
  })

  it('returns [] for a ticket with no articles', async () => {
    fakeOtobo(1, 0)
    const p = sink({ page: 1, limit: 10 })
    expect(await adapter.listMessages(creds, '1', p)).toEqual([])
    expect(readUpstreamPage(p)).toMatchObject({ hasMore: false, totalCount: 0 })
  })
})

const NOT_VALID_TICKET_ID = {
  Error: {
    ErrorCode: 'TicketGet.NotValidTicketID',
    ErrorMessage:
      'TicketGet: Could not get Ticket data in Kernel::GenericInterface::Operation::Ticket::TicketGet::Run()',
  },
}

describe('otobo ticket identity and TicketGet errors', () => {
  it('getTicket treats one ticket with a different TicketID as not found', async () => {
    state.handler = () => ({ Ticket: [ticket(7)] })
    await expect(adapter.getTicket(creds, '2')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('getTicket treats more than one ticket, even led by the right one, as not found', async () => {
    state.handler = () => ({ Ticket: [ticket(2), ticket(3)] })
    await expect(adapter.getTicket(creds, '2')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('getTicket surfaces TicketGet.NotValidTicketID as 404', async () => {
    state.handler = () => NOT_VALID_TICKET_ID
    await expect(adapter.getTicket(creds, '2')).rejects.toMatchObject({
      statusCode: 404,
      code: 'TicketGet.NotValidTicketID',
    })
  })

  it('listMessages treats one ticket with a different TicketID as not found', async () => {
    state.handler = () => ({ Ticket: [{ ...ticket(7), Article: [article(0)] }] })
    await expect(
      adapter.listMessages(creds, '2', sink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('otobo listTickets when a ticket is deleted between search and fetch', () => {
  it('searches the page again once and serves the refreshed ids', async () => {
    fakeOtobo(5)
    const live = state.handler
    let deleted = false
    state.handler = (path, params) => {
      // ticket 2 disappears after the first search: TicketGet on it fails the whole call
      if (path === '/Ticket/1,2,3' && !deleted) {
        deleted = true
        return NOT_VALID_TICKET_ID
      }
      if (path === '/Ticket' && deleted) {
        // search runs over the remaining tickets, then applies Limit
        live(path, params)
        return { TicketID: [1, 3, 4, 5].slice(0, Number(params['Limit'])) }
      }
      return live(path, params)
    }
    const p = sink({ page: 1, limit: 3 })
    const rows = await adapter.listTickets(creds, p)
    expect(rows.map((r) => r.id)).toEqual(['1', '3', '4'])
    expect(state.calls.map((c) => c.path)).toEqual([
      '/Ticket',
      '/Ticket/1,2,3',
      '/Ticket',
      '/Ticket/1,3,4',
    ])
    expect(readUpstreamPage(p)).toMatchObject({ hasMore: true })
  })

  it('does not search again for other TicketGet errors', async () => {
    fakeOtobo(5)
    const live = state.handler
    state.handler = (path, params) =>
      path === '/Ticket'
        ? live(path, params)
        : {
            Error: {
              ErrorCode: 'TicketGet.AccessDenied',
              ErrorMessage: 'User does not have access to the ticket!',
            },
          }
    await expect(adapter.listTickets(creds, sink({ page: 1, limit: 2 }))).rejects.toMatchObject({
      statusCode: 403,
      code: 'TicketGet.AccessDenied',
    })
    expect(state.calls.map((c) => c.path)).toEqual(['/Ticket', '/Ticket/1,2'])
  })

  it('reports a TicketGet that keeps failing as 502, not a 404 for the collection', async () => {
    fakeOtobo(5)
    const live = state.handler
    state.handler = (path, params) =>
      path === '/Ticket' ? live(path, params) : NOT_VALID_TICKET_ID
    await expect(adapter.listTickets(creds, sink({ page: 1, limit: 2 }))).rejects.toMatchObject({
      statusCode: 502,
      code: 'TicketGet.NotValidTicketID',
    })
    expect(state.calls.map((c) => c.path)).toEqual([
      '/Ticket',
      '/Ticket/1,2',
      '/Ticket',
      '/Ticket/1,2',
    ])
  })
})
