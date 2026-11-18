import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  _resetRowPager,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { Comm100Client } from '../../../../../../src/verticals/customer-support/adapters/comm100/client'
import { Comm100Adapter } from '../../../../../../src/verticals/customer-support/adapters/comm100/index'
import {
  DOC_AGENT,
  DOC_CONTACT,
  DOC_DEPARTMENT,
  DOC_MESSAGE,
  DOC_TAG,
  DOC_TICKET,
} from './fixtures'

/**
 * Request shapes and paging against Comm100's documented v4 contract:
 *
 * - https://developer.comm100.com/docs/server-api-introduction: base
 *   "https://api11.comm100.io/v4/" for dash11 (and 12, 13, 15, 17); list
 *   paging "pageIndex" / "pageSize ... Default number of results is 10." and
 *   "nextPage ... if there is no next page, show null."
 * - https://developer.comm100.com/docs/server-api-global-setting-contact:
 *   contacts "pageSize, default is 50, and the value can not be larger than 500."
 * - agents, departments, tags and ticket messages return a bare array.
 * - https://developer.comm100.com/docs/server-api-authentication: Basic auth,
 *   email / API key, with the siteId parameter.
 *
 * The fakes honour ONLY those parameters.
 */

const CREDS: Credentials = {
  accessToken: 'api-key-1',
  extra: { email: 'agent@example.com', siteId: '10000', portalNumber: '11' },
} as Credentials

interface Call {
  path: string
  params: Record<string, unknown>
}

const ticketRow = (i: number) => ({ ...DOC_TICKET, id: 1000 + i })
const contactRow = (i: number) => ({ ...DOC_CONTACT, id: `c-${i}` })

/** A Comm100 fake. `ticketClamp` caps the ticket pageSize server-side, making upstream pages uneven vs. the ask. */
function fakeComm100(n: number, opts: { ticketClamp?: number } = {}) {
  const calls: Call[] = []
  const tickets = Array.from({ length: n }, (_, i) => ticketRow(i))
  const contacts = Array.from({ length: n }, (_, i) => contactRow(i))
  const arrays: Record<string, unknown[]> = {
    'global/agents': Array.from({ length: n }, (_, i) => ({ ...DOC_AGENT, id: `a-${i}` })),
    'global/departments': Array.from({ length: n }, (_, i) => ({
      ...DOC_DEPARTMENT,
      id: `d-${i}`,
    })),
    'ticketing/tags': Array.from({ length: n }, (_, i) => ({ ...DOC_TAG, id: `t-${i}` })),
    'ticketing/tickets/77/messages': Array.from({ length: n }, (_, i) => ({
      ...DOC_MESSAGE,
      id: `m-${i}`,
    })),
  }
  const envelope = (rows: unknown[], p: Record<string, unknown>, def: number, max: number) => {
    const pageIndex = typeof p['pageIndex'] === 'number' ? p['pageIndex'] : 1
    const asked = typeof p['pageSize'] === 'number' ? p['pageSize'] : def
    if (asked > max)
      throw Object.assign(new Error('400 Bad Request'), { response: { status: 400 } })
    const size = Math.min(asked, opts.ticketClamp ?? Infinity)
    const slice = rows.slice((pageIndex - 1) * size, pageIndex * size)
    const more = pageIndex * size < rows.length
    return {
      slice,
      nextPage: more ? `https://api11.comm100.io/v4/x?pageIndex=${pageIndex + 1}` : null,
      total: rows.length,
    }
  }
  const spy = vi
    .spyOn(Comm100Client.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      const p = params ?? {}
      calls.push({ path, params: p })
      if (path === 'ticketing/tickets') {
        const e = envelope(tickets, p, 10, Infinity)
        return {
          tickets: e.slice,
          nextPage: e.nextPage,
          previousPage: null,
          total: e.total,
        } as never
      }
      if (path === 'contact/contacts') {
        const e = envelope(contacts, p, 50, 500)
        return {
          contacts: e.slice,
          nextPage: e.nextPage,
          previousPage: null,
          total: e.total,
        } as never
      }
      const rows = arrays[path]
      if (!rows) throw new Error(`unexpected path ${path}`)
      return rows as never
    })
  return { calls, spy }
}

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

const adapter = new Comm100Adapter()
type Lister = (params: QueryParams) => Promise<Array<{ id: string }>>

const L = 3
const N = 2 * L + 1

async function walk(list: Lister, limit = L) {
  const seen: string[] = []
  const hasMore: Array<boolean | undefined> = []
  for (let page = 1; ; page++) {
    const params = withPageSink({ page, limit })
    const rows = await list(params)
    seen.push(...rows.map((r) => r.id))
    const more = readUpstreamPage(params)?.hasMore
    hasMore.push(more)
    if (!more || page > 20) break
  }
  return { seen, hasMore }
}

const METHODS: Array<{ name: string; expected: string[]; list: Lister }> = [
  {
    name: 'listTickets',
    expected: Array.from({ length: N }, (_, i) => String(1000 + i)),
    list: (p) => adapter.listTickets(CREDS, p),
  },
  {
    name: 'listContacts',
    expected: Array.from({ length: N }, (_, i) => `c-${i}`),
    list: (p) => adapter.listContacts(CREDS, p),
  },
  {
    name: 'listUsers',
    expected: Array.from({ length: N }, (_, i) => `a-${i}`),
    list: (p) => adapter.listUsers(CREDS, p),
  },
  {
    name: 'listTeams',
    expected: Array.from({ length: N }, (_, i) => `d-${i}`),
    list: (p) => adapter.listTeams(CREDS, p),
  },
  {
    name: 'listTags',
    expected: Array.from({ length: N }, (_, i) => `t-${i}`),
    list: (p) => adapter.listTags(CREDS, p),
  },
  {
    name: 'listMessages',
    expected: Array.from({ length: N }, (_, i) => `m-${i}`),
    list: (p) => adapter.listMessages(CREDS, '77', p),
  },
]

describe.each(METHODS)('Comm100Adapter.$name paging', ({ expected, list }) => {
  it('serves every row once across pages 1..3 with exact hasMore', async () => {
    fakeComm100(N)
    const { seen, hasMore } = await walk(list)
    expect(seen).toEqual(expected)
    expect(hasMore).toEqual([true, true, false])
  })

  it('ends exactly when the collection ends on a page boundary', async () => {
    fakeComm100(2 * L)
    const { seen, hasMore } = await walk(list)
    expect(seen).toEqual(expected.slice(0, 2 * L))
    expect(hasMore).toEqual([true, false])
  })
})

describe('Comm100Adapter.listTickets requests', () => {
  it("sends pageIndex and the caller's pageSize to ticketing/tickets, peeking at the next page for hasMore", async () => {
    const { calls } = fakeComm100(N)
    await adapter.listTickets(CREDS, withPageSink({ page: 1, limit: L }))
    expect(calls).toEqual([
      { path: 'ticketing/tickets', params: { pageIndex: 1, pageSize: L } },
      { path: 'ticketing/tickets', params: { pageIndex: 2, pageSize: L } },
    ])
    // The peeked page is kept: page 2 costs no request.
    await adapter.listTickets(CREDS, withPageSink({ page: 2, limit: L }))
    expect(calls.map((c) => c.params['pageIndex'])).toEqual([1, 2, 3])
  })

  it('reaches page 3 from a cold start by walking pageIndex 1..3', async () => {
    const { calls } = fakeComm100(N)
    const rows = await adapter.listTickets(CREDS, withPageSink({ page: 3, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(['1006'])
    expect(calls.map((c) => c.params['pageIndex'])).toEqual([1, 2, 3])
  })

  it('serves every row once when the server clamps pageSize below the ask (uneven upstream pages)', async () => {
    fakeComm100(N, { ticketClamp: 2 })
    const { seen, hasMore } = await walk((p) => adapter.listTickets(CREDS, p))
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(1000 + i)))
    expect(hasMore).toEqual([true, true, false])
  })

  it('never sends more than the declared 500 page maximum', async () => {
    const { calls } = fakeComm100(N)
    await adapter.listTickets(CREDS, withPageSink({ page: 1, limit: 600 }))
    expect(calls[0]!.params['pageSize']).toBe(500)
  })

  it('keeps pager state per site: another siteId on the same login does not reuse the peeked page', async () => {
    const { calls } = fakeComm100(N)
    await adapter.listTickets(CREDS, withPageSink({ page: 1, limit: L }))
    const otherSite = { ...CREDS, extra: { ...CREDS.extra, siteId: '20000' } } as Credentials
    calls.length = 0
    await adapter.listTickets(otherSite, withPageSink({ page: 2, limit: L }))
    expect(calls.map((c) => c.params['pageIndex'])).toEqual([1, 2, 3])
  })

  it('stops on nextPage null even when the last page is full', async () => {
    const { calls } = fakeComm100(L)
    const params = withPageSink({ page: 1, limit: L })
    await adapter.listTickets(CREDS, params)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls).toHaveLength(1)
  })
})

describe('Comm100Adapter.listContacts requests', () => {
  it("sends the caller's page as pageIndex and limit as pageSize, reporting total", async () => {
    const { calls } = fakeComm100(N)
    const params = withPageSink({ page: 2, limit: L })
    await adapter.listContacts(CREDS, params)
    expect(calls).toEqual([{ path: 'contact/contacts', params: { pageIndex: 2, pageSize: L } }])
    expect(readUpstreamPage(params)?.totalCount).toBe(N)
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })

  it('sends the documented default of 50 when the caller names no limit', async () => {
    const { calls } = fakeComm100(N)
    await adapter.listContacts(CREDS, withPageSink({ page: 1 }))
    expect(calls[0]!.params['pageSize']).toBe(50)
  })

  it('clamps pageSize to the documented 500 and reports the size sent', async () => {
    const { calls } = fakeComm100(N)
    const params = withPageSink({ page: 1, limit: 600 })
    await adapter.listContacts(CREDS, params)
    expect(calls[0]!.params['pageSize']).toBe(500)
    expect(readUpstreamPage(params)?.pageSize).toBe(500)
  })

  it('declares the documented 500 as its page maximum', () => {
    expect(adapter.capabilities.maxPageSize).toBe(500)
  })
})

describe('Comm100Adapter whole-array lists', () => {
  it.each([
    ['listUsers', 'global/agents', {}],
    ['listTeams', 'global/departments', {}],
    ['listTags', 'ticketing/tags', {}],
  ] as const)('%s reads %s with no paging parameters', async (name, path, params) => {
    const { calls } = fakeComm100(N)
    await (adapter[name] as (c: Credentials, p: QueryParams) => Promise<unknown>)(
      CREDS,
      withPageSink({ page: 2, limit: L }),
    )
    expect(calls).toEqual([{ path, params }])
  })

  it('listMessages sends the documented ticketId query parameter', async () => {
    const { calls } = fakeComm100(N)
    await adapter.listMessages(CREDS, '77', withPageSink({ page: 1, limit: L }))
    expect(calls).toEqual([{ path: 'ticketing/tickets/77/messages', params: { ticketId: '77' } }])
  })
})

describe('Comm100Adapter get methods', () => {
  it.each([
    ['getTicket', 'ticketing/tickets/11', DOC_TICKET],
    ['getContact', 'contact/contacts/c-1', DOC_CONTACT],
    ['getUser', 'global/agents/a-1', DOC_AGENT],
    ['getTeam', 'global/departments/d-1', DOC_DEPARTMENT],
  ] as const)('%s reads %s', async (name, path, row) => {
    const spy = vi.spyOn(Comm100Client.prototype, 'get').mockResolvedValue(row as never)
    const id = path.split('/').pop()!
    await (adapter[name] as (c: Credentials, id: string) => Promise<unknown>)(CREDS, id)
    expect(spy).toHaveBeenCalledWith(path)
  })
})

describe('Comm100 client and credentials', () => {
  it('targets api{n}.comm100.io/v4/ with Basic email:apiKey and adds siteId to every request', async () => {
    const get = vi.fn().mockResolvedValue({ data: [] })
    const create = vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    await new Comm100Client(CREDS).get('global/agents', { a: 1 })
    const cfg = create.mock.calls[0]![0]!
    expect(cfg.baseURL).toBe('https://api11.comm100.io/v4/')
    expect(cfg.auth).toEqual({ username: 'agent@example.com', password: 'api-key-1' })
    expect(get).toHaveBeenCalledWith('global/agents', { params: { a: 1, siteId: '10000' } })
  })

  it('refuses a connection saved under the old v3 password grant (portal 1, no siteId)', () => {
    expect(
      () => new Comm100Client({ accessToken: 't', extra: { portalNumber: '1' } } as Credentials),
    ).toThrow(/reconnect/)
  })

  it.each(['email', 'siteId', 'portalNumber'])(
    'refuses a connection missing only %s before any request',
    (field) => {
      const extra = { ...CREDS.extra } as Record<string, unknown>
      delete extra[field]
      const create = vi.spyOn(axios, 'create')
      expect(() => new Comm100Client({ ...CREDS, extra } as Credentials)).toThrow(/reconnect/)
      expect(create).not.toHaveBeenCalled()
    },
  )

  it('refuses a connection missing only the API key before any request', () => {
    expect(() => new Comm100Client({ ...CREDS, accessToken: '' } as Credentials)).toThrow(
      /reconnect/,
    )
  })

  it('exchangeCredentials stores the key and the site, and rejects an undocumented domain number', async () => {
    const creds = await adapter.exchangeCredentials({
      email: 'agent@example.com',
      apiKey: 'k',
      siteId: '10000',
      portalNumber: '15',
    })
    expect(creds).toEqual({
      accessToken: 'k',
      extra: { email: 'agent@example.com', siteId: '10000', portalNumber: '15' },
    })
    await expect(
      adapter.exchangeCredentials({ email: 'a@b.co', apiKey: 'k', siteId: '1', portalNumber: '1' }),
    ).rejects.toThrow(/portalNumber/)
  })
})
