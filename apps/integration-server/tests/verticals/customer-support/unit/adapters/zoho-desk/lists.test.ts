/**
 * Zoho Desk reads on Desk API v1 (https://desk.zoho.com/DeskAPIDocument).
 *
 * The adapter used to be a Zendesk copy: it called `/tickets.json`,
 * `/users.json`, `/groups.json`, `/tags.json` and `/macros.json` on a fixed US
 * host with `per_page` and `page[after]`, none of which Zoho Desk has, and sent
 * no `orgId`. Every list now pages by the documented `from` (0-based row
 * offset) and `limit`, on the connection's data-centre host, with the orgId
 * header. Methods with no documented endpoint refuse with 501 before any
 * request.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, type QueryParams } from '@opensteward/shared'
import { ZohoDeskAdapter } from '../../../../../../src/verticals/customer-support/adapters/zoho-desk/index'
import {
  TicketSchema,
  MessageSchema,
  ContactSchema,
  UserSchema,
  TeamSchema,
} from '../../../../../../src/verticals/customer-support/schema'

const CFG = { clientId: 'cid', clientSecret: 'sec', redirectUri: 'http://localhost/cb' }
const CREDS = {
  accessToken: 'tok',
  refreshToken: 'rt',
  tenantId: '2389290',
  extra: { dataCentre: 'eu', orgId: '2389290' },
}

interface Call {
  path: string
  params: Record<string, unknown>
}

function fakeDesk(
  respond: (path: string, params: Record<string, unknown>) => { status?: number; data: unknown },
) {
  const calls: Call[] = []
  const created: Array<Record<string, unknown>> = []
  const create = vi.spyOn(axios, 'create').mockImplementation(((
    config: Record<string, unknown>,
  ) => {
    created.push(config)
    return {
      get: async (path: string, opts?: { params?: Record<string, unknown> }) => {
        const params = opts?.params ?? {}
        calls.push({ path, params })
        const r = respond(path, params)
        return { status: r.status ?? 200, data: r.data }
      },
    }
  }) as unknown as typeof axios.create)
  return { calls, created, create }
}

/** `n` rows with ids starting at `from`, like a Desk list page. */
function rows(from: number, n: number, make: (i: number) => Record<string, unknown>) {
  return Array.from({ length: n }, (_, k) => make(from + k))
}

const params = (p: Partial<QueryParams>): QueryParams => withPageSink({ page: 1, limit: 10, ...p })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('client', () => {
  it("calls the data centre's Desk host with the Zoho-oauthtoken and orgId headers", async () => {
    const { created } = fakeDesk(() => ({ data: { data: [] } }))
    await new ZohoDeskAdapter(CFG).listTickets(CREDS, params({}))
    expect(created[0]!['baseURL']).toBe('https://desk.zoho.eu/api/v1')
    expect(created[0]!['headers']).toMatchObject({
      Authorization: 'Zoho-oauthtoken tok',
      orgId: '2389290',
    })
  })

  it('refuses a connection with no recorded orgId instead of calling without one', async () => {
    const { calls } = fakeDesk(() => ({ data: { data: [] } }))
    await expect(
      new ZohoDeskAdapter(CFG).listTickets(
        { accessToken: 't', extra: { dataCentre: 'us' } },
        params({}),
      ),
    ).rejects.toThrow('credentials.extra.orgId')
    expect(calls).toEqual([])
  })
})

describe('offset paging', () => {
  const adapter = new ZohoDeskAdapter(CFG)

  it('listTickets sends from = 0-based offset, limit = the caller limit, and a fixed sort', async () => {
    const { calls } = fakeDesk((_p, q) => ({
      data: {
        data: rows(Number(q['from']), Number(q['limit']), (i) => ({
          id: String(i),
          subject: `t${i}`,
          statusType: 'Open',
          createdTime: '2016-06-21T13:16:14.000Z',
        })),
      },
    }))
    const p1 = params({ page: 1, limit: 10 })
    const page1 = await adapter.listTickets(CREDS, p1)
    const page2 = await adapter.listTickets(CREDS, params({ page: 2, limit: 10 }))
    expect(calls.map((c) => c.path)).toEqual(['/tickets', '/tickets'])
    expect(calls[0]!.params).toEqual({ sortBy: 'createdTime', from: 0, limit: 10 })
    expect(calls[1]!.params).toEqual({ sortBy: 'createdTime', from: 10, limit: 10 })
    expect(page1.map((t) => t.id)).toEqual(rows(0, 10, (i) => ({ i })).map((r) => String(r['i'])))
    expect(page2[0]!.id).toBe('10')
    for (const t of page1) TicketSchema.parse(t)
    // A full page with no total leaves the end unknown.
    expect(readUpstreamPage(p1)?.hasMore).toBeUndefined()
  })

  it('reports a short page as the last one', async () => {
    fakeDesk(() => ({ data: { data: [{ id: '1', lastName: 'Case' }] } }))
    const p = params({ limit: 10 })
    const out = await adapter.listContacts(CREDS, p)
    expect(out).toHaveLength(1)
    expect(readUpstreamPage(p)?.hasMore).toBe(false)
  })

  it('reads a 204 No Content as an empty last page', async () => {
    fakeDesk(() => ({ status: 204, data: '' }))
    const p = params({})
    expect(await adapter.listUsers(CREDS, p)).toEqual([])
    expect(readUpstreamPage(p)?.hasMore).toBe(false)
  })

  it('clamps a direct call past 100 and reports the size it asked for', async () => {
    const { calls } = fakeDesk(() => ({ data: { data: [] } }))
    const p = params({ page: 3, limit: 250 })
    await adapter.listContacts(CREDS, p)
    expect(calls[0]!.params).toEqual({ sortBy: 'createdTime', from: 200, limit: 100 })
    expect(readUpstreamPage(p)?.pageSize).toBe(100)
  })

  it('listMessages pages GET /tickets/{id}/conversations and maps threads and comments', async () => {
    const { calls } = fakeDesk(() => ({
      data: {
        data: [
          {
            id: '1892000001080014',
            type: 'thread',
            visibility: 'public',
            author: { type: 'AGENT' },
            responderId: '1892000000042001',
            summary: 'Fixed.',
            createdTime: '2016-07-07T10:12:04.177Z',
            attachmentCount: '7',
          },
          {
            id: '1892000000886025',
            type: 'comment',
            isPublic: false,
            content: 'internal note',
            commenterId: '1892000000042001',
            commenter: { type: 'AGENT' },
            commentedTime: '2016-02-16T09:21:58.000Z',
          },
        ],
      },
    }))
    const out = await adapter.listMessages(CREDS, '1892000000321001', params({ page: 2, limit: 5 }))
    expect(calls[0]).toEqual({
      path: '/tickets/1892000000321001/conversations',
      params: { from: 5, limit: 5 },
    })
    expect(out.map((m) => m.type)).toEqual(['public', 'internal'])
    for (const m of out) MessageSchema.parse(m)
  })

  it('listUsers pages GET /agents', async () => {
    const { calls } = fakeDesk(() => ({
      data: { data: [{ id: '1892000000056007', name: 'zyl case', emailId: 'case@zylker.com' }] },
    }))
    const out = await adapter.listUsers(CREDS, params({ page: 2, limit: 7 }))
    expect(calls[0]).toEqual({ path: '/agents', params: { from: 7, limit: 7 } })
    UserSchema.parse(out[0])
  })

  it('listTeams pages GET /teams and reads its `teams` key', async () => {
    const { calls } = fakeDesk(() => ({
      data: {
        teams: [{ id: '17000000013003', name: 'Sales Reps.', agents: [], derivedAgents: [] }],
      },
    }))
    const out = await adapter.listTeams(CREDS, params({ page: 1, limit: 10 }))
    expect(calls[0]).toEqual({ path: '/teams', params: { from: 0, limit: 10 } })
    expect(out.map((t) => t.name)).toEqual(['Sales Reps.'])
    TeamSchema.parse(out[0])
  })
})

describe('listTickets with updated_after (GET /tickets/search)', () => {
  const adapter = new ZohoDeskAdapter(CFG)
  const since = new Date('2026-09-01T00:00:00.000Z')

  it('filters server-side by modifiedTimeRange, sorted by modifiedTime; a count past the rows served means more', async () => {
    const { calls } = fakeDesk(() => ({
      data: {
        data: rows(10, 10, (i) => ({
          id: String(i),
          statusType: 'Closed',
          modifiedTime: '2026-09-02T00:00:00.000Z',
        })),
        count: 25,
      },
    }))
    const p = params({ page: 2, limit: 10, updatedAfter: since })
    const out = await adapter.listTickets(CREDS, p)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe('/tickets/search')
    const q = calls[0]!.params
    expect(q['sortBy']).toBe('modifiedTime')
    expect(q['from']).toBe(10)
    expect(q['limit']).toBe(10)
    const [lo, hi] = String(q['modifiedTimeRange']).split(',')
    expect(lo).toBe('2026-09-01T00:00:00.000Z')
    expect(Number.isNaN(new Date(hi!).getTime())).toBe(false)
    expect(readUpstreamPage(p)?.hasMore).toBe(true)
    // `count`'s meaning (all matches, or this page) is undocumented, so it is
    // never reported as a total.
    expect(readUpstreamPage(p)?.totalCount).toBeUndefined()
    for (const t of out) TicketSchema.parse(t)
  })

  it('does not read a count equal to the page as the end (count may be per page)', async () => {
    fakeDesk(() => ({ data: { data: rows(10, 10, (i) => ({ id: String(i) })), count: 10 } }))
    const p = params({ page: 2, limit: 10, updatedAfter: since })
    await adapter.listTickets(CREDS, p)
    expect(readUpstreamPage(p)?.hasMore).toBeUndefined()
  })

  it('ends on a short page', async () => {
    fakeDesk(() => ({ data: { data: rows(20, 5, (i) => ({ id: String(i) })), count: 25 } }))
    const p = params({ page: 3, limit: 10, updatedAfter: since })
    await adapter.listTickets(CREDS, p)
    expect(readUpstreamPage(p)?.hasMore).toBe(false)
  })

  it('reads a 204 (no matches) as an empty last page', async () => {
    fakeDesk(() => ({ status: 204, data: '' }))
    const p = params({ updatedAfter: since })
    expect(await adapter.listTickets(CREDS, p)).toEqual([])
    expect(readUpstreamPage(p)?.hasMore).toBe(false)
  })

  it('refuses a page past the documented search window (from 0-4999) without a request', async () => {
    const { calls } = fakeDesk(() => ({ data: { data: [] } }))
    await expect(
      adapter.listTickets(CREDS, params({ page: 51, limit: 100, updatedAfter: since })),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toEqual([])
    // The last reachable page is still served.
    await adapter.listTickets(CREDS, params({ page: 50, limit: 100, updatedAfter: since }))
    expect(calls[0]!.params['from']).toBe(4900)
  })
})

describe('listContacts with updated_after (GET /contacts/search)', () => {
  const adapter = new ZohoDeskAdapter(CFG)
  const since = new Date('2026-09-01T00:00:00.000Z')

  it('filters server-side by modifiedTimeRange instead of listing every contact', async () => {
    const { calls } = fakeDesk(() => ({
      data: {
        data: [
          {
            id: '1892000000042032',
            firstName: 'Jennifer',
            lastName: 'Lawrence',
            email: 'lawrence@zylker.com',
            accountId: '1892000000975382',
          },
        ],
        count: 1,
      },
    }))
    const p = params({ page: 2, limit: 20, updatedAfter: since })
    const out = await adapter.listContacts(CREDS, p)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe('/contacts/search')
    const q = calls[0]!.params
    expect(q['sortBy']).toBe('modifiedTime')
    expect(q['from']).toBe(20)
    expect(q['limit']).toBe(20)
    expect(String(q['modifiedTimeRange']).split(',')[0]).toBe('2026-09-01T00:00:00.000Z')
    expect(readUpstreamPage(p)?.hasMore).toBe(false)
    expect(ContactSchema.parse(out[0]).name).toBe('Jennifer Lawrence')
  })

  it('refuses a page past the search window without a request', async () => {
    const { calls } = fakeDesk(() => ({ data: { data: [] } }))
    await expect(
      adapter.listContacts(CREDS, params({ page: 51, limit: 100, updatedAfter: since })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toEqual([])
  })
})

describe('single reads', () => {
  const adapter = new ZohoDeskAdapter(CFG)

  it('get* call the documented by-id endpoints', async () => {
    const { calls } = fakeDesk((path) => {
      if (path.startsWith('/tickets/'))
        return {
          data: {
            id: '1892000000042034',
            subject: 's',
            status: 'On Hold',
            contactId: '1892000000042032',
            createdTime: '2013-11-04T11:21:07.000Z',
          },
        }
      if (path.startsWith('/contacts/'))
        return {
          data: {
            id: '1892000000042032',
            firstName: 'Jennifer',
            lastName: 'Lawrence',
            email: 'lawrence@zylker.com',
          },
        }
      if (path.startsWith('/agents/'))
        return { data: { id: '1892000000056096', name: 'case', emailId: 'case@zylker.com' } }
      return {
        data: {
          id: '6000000014007',
          name: 'Sales Reps.',
          agents: ['6000000009086'],
          derivedAgents: ['6000000009086', '6000000012003'],
        },
      }
    })
    const t = await adapter.getTicket(CREDS, '1892000000042034')
    const c = await adapter.getContact(CREDS, '1892000000042032')
    const u = await adapter.getUser(CREDS, '1892000000056096')
    const team = await adapter.getTeam(CREDS, '6000000014007')
    expect(calls.map((x) => x.path)).toEqual([
      '/tickets/1892000000042034',
      '/contacts/1892000000042032',
      '/agents/1892000000056096',
      '/teams/6000000014007',
    ])
    expect(TicketSchema.parse(t).status).toBe('on_hold')
    ContactSchema.parse(c)
    UserSchema.parse(u)
    expect(TeamSchema.parse(team).memberCount).toBe(2)
  })
})

describe('refused methods (501 NOT_SUPPORTED, no request)', () => {
  const adapter = new ZohoDeskAdapter(CFG)
  const cases: Array<[string, () => Promise<unknown>]> = [
    ['getMessage', () => adapter.getMessage(CREDS, '1')],
    ['listTags', () => adapter.listTags(CREDS, params({}))],
    ['getTag', () => adapter.getTag(CREDS, '1')],
    ['listMacros', () => adapter.listMacros(CREDS, params({}))],
    ['getMacro', () => adapter.getMacro(CREDS, '1')],
  ]
  it.each(cases)('%s', async (_name, call) => {
    const { calls, create } = fakeDesk(() => ({ data: {} }))
    await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toEqual([])
    expect(create).not.toHaveBeenCalled()
  })
})
