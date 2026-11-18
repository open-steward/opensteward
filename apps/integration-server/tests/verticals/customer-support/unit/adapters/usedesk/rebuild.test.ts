/**
 * UseDesk messages, users and tags, against fakes that honour only the
 * documented request parameters.
 *
 * - POST /uapi/ticket (https://api.usedocs.com/article/51377): "ticket_id*
 *   Ticket ID"; "The server returns a ticket, all comments, tags and a
 *   history of changes." No comment list endpoint exists.
 * - POST /uapi/users (https://api.usedocs.com/article/51414): user_type
 *   "Possible values: admin; employee; support By default: employee";
 *   user_id "If this field is passed, information about one agent will be
 *   returned". No offset or page size.
 * - POST /uapi/tags (https://api.usedocs.com/article/51382): "The response
 *   has a maximum of 100 entries, the offset parameter is used." / "Offset by
 *   1 will show the next 100 entries".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { UsedeskAdapter } from '../../../../../../src/verticals/customer-support/adapters/usedesk/index'

const creds: Credentials = { accessToken: 'tok' }

interface Call {
  path: string
  body: Record<string, unknown>
}

let calls: Call[] = []
let handler: (call: Call) => unknown

beforeEach(() => {
  _resetRowPager()
  calls = []
  vi.spyOn(axios, 'create').mockImplementation(
    () =>
      ({
        post: async (path: string, body?: Record<string, unknown>) => {
          const call = { path, body: { ...(body ?? {}) } }
          calls.push(call)
          return { data: handler(call) }
        },
      }) as unknown as ReturnType<typeof axios.create>,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

const range = (n: number, prefix = '') => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)

async function walk(run: (p: QueryParams) => Promise<{ id: string }[]>, limit: number) {
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    ids.push(...rows.map((r) => r.id))
    hasMore.push(listPage(rows, params, 'usedesk').meta.hasMore ?? undefined)
  }
  return { ids, hasMore }
}

const adapter = new UsedeskAdapter()

// ── Messages ────────────────────────────────────────────────────────────────

function comment(id: string, ticketId: string) {
  return {
    id,
    message: `m${id}`,
    from: 'client',
    user_id: null,
    client_id: '261702',
    ticket_id: ticketId,
    published_at: '2017-03-01 14:30:49',
  }
}

/** POST /ticket: the ticket and all its comments, by ticket_id only. */
function singleTicket(nComments: number) {
  return (call: Call) => {
    if (call.path !== '/ticket') throw new Error(`unexpected path ${call.path}`)
    const ticketId = String(call.body['ticket_id'])
    return {
      ticket: { id: ticketId, status_id: '1', subject: 's', published_at: '2017-03-01 14:30:49' },
      comments: range(nComments, 'c').map((id) => comment(id, ticketId)),
      changes: [],
      tags: [],
    }
  }
}

describe('usedesk listMessages', () => {
  const run = (p: QueryParams) => adapter.listMessages(creds, '2265179', p)

  it('reads the comments POST /ticket embeds, sending only ticket_id', async () => {
    handler = singleTicket(3)
    const rows = await run(withPageSink({ page: 1, limit: 10 }))
    expect(calls).toEqual([{ path: '/ticket', body: { ticket_id: '2265179', api_token: 'tok' } }])
    expect(rows.map((r) => r.id)).toEqual(['c1', 'c2', 'c3'])
    expect(rows.every((r) => r.ticketId === '2265179')).toBe(true)
  })

  it('serves every comment once across pages of 2L+1 rows', async () => {
    const L = 4
    handler = singleTicket(2 * L + 1)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1, 'c'))
    expect(hasMore).toEqual([true, true, false])
  })

  it('throws when the response carries no comments array', async () => {
    handler = () => ({ status: 'error' })
    await expect(run(withPageSink({ page: 1, limit: 10 }))).rejects.toThrow(/no comments array/)
  })
})

// ── Users ───────────────────────────────────────────────────────────────────

function agent(id: string, role: string) {
  return {
    id,
    name: `Agent ${id}`,
    email: `a${id}@example.com`,
    position: '',
    role,
    phone: null,
    chat_online_status: '1',
    online_status: '0',
    groups: [],
  }
}

/** POST /users honouring only user_type (default employee) and user_id. */
function users(byType: Record<string, string[]>) {
  return (call: Call) => {
    if (call.path !== '/users') throw new Error(`unexpected path ${call.path}`)
    const all = Object.entries(byType).flatMap(([role, ids]) => ids.map((id) => agent(id, role)))
    if (call.body['user_id'] !== undefined)
      return all.filter((a) => a.id === String(call.body['user_id']))
    const type = String(call.body['user_type'] ?? 'employee')
    return (byType[type] ?? []).map((id) => agent(id, type))
  }
}

describe('usedesk listUsers', () => {
  const run = (p: QueryParams) => adapter.listUsers(creds, p)

  it('asks POST /users for every documented user_type and nothing else', async () => {
    handler = users({ admin: ['1'], employee: ['2'], support: ['3'] })
    const rows = await run(withPageSink({ page: 1, limit: 10 }))
    expect(calls.map((c) => c.path)).toEqual(['/users', '/users', '/users'])
    expect(calls.map((c) => c.body)).toEqual([
      { user_type: 'admin', api_token: 'tok' },
      { user_type: 'employee', api_token: 'tok' },
      { user_type: 'support', api_token: 'tok' },
    ])
    expect(rows.map((r) => [r.id, r.role])).toEqual([
      ['1', 'admin'],
      ['2', 'employee'],
      ['3', 'support'],
    ])
  })

  it('serves every agent once across pages of 2L+1 rows', async () => {
    const L = 3
    handler = users({ admin: ['1', '2'], employee: ['3', '4', '5'], support: ['6', '7'] })
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('an agent returned under two user_types appears once', async () => {
    handler = (call: Call) => [agent('9', String(call.body['user_type']))]
    const rows = await run(withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(['9'])
  })

  it('throws when one user_type returns an error body instead of an array', async () => {
    // Article 51419: "The status of responses is 200, the response will
    // contain an error code and its description."
    const ok = users({ admin: ['1'], support: ['3'] })
    handler = (call: Call) =>
      call.body['user_type'] === 'employee' ? { status: 'error', code: 111 } : ok(call)
    await expect(run(withPageSink({ page: 1, limit: 10 }))).rejects.toThrow(/not an array/)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    handler = users({ admin: range(20), employee: range(21).slice(20) })
    const params = parseListQuery({ page: '2', limit: '10' })
    const env = listPage(await run(params), params, 'usedesk')
    expect(env.data.map((r) => r.id)).toEqual(range(20).slice(10))
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('usedesk getUser', () => {
  it('reads one agent from POST /users by user_id', async () => {
    handler = users({ admin: ['1'], employee: ['2'] })
    const user = await adapter.getUser(creds, '2')
    expect(calls).toEqual([{ path: '/users', body: { user_id: '2', api_token: 'tok' } }])
    expect(user.id).toBe('2')
  })

  it('returns the agent whose id matches, not the first row', async () => {
    handler = () => [agent('1', 'admin'), agent('2', 'employee')]
    const user = await adapter.getUser(creds, '2')
    expect(user.id).toBe('2')
  })

  it('throws when no agent has that id', async () => {
    handler = users({ admin: ['1'] })
    await expect(adapter.getUser(creds, '99')).rejects.toThrow(/not found/)
  })
})

// ── Tags ────────────────────────────────────────────────────────────────────

const UPSTREAM = 100

/** POST /tags: body `offset` is a page index over pages of 100. */
function tags(n: number, prefix = 't') {
  return (call: Call) => {
    if (call.path !== '/tags') throw new Error(`unexpected path ${call.path}`)
    const offset = Math.max(0, Number(call.body['offset'] ?? 0))
    return range(n, prefix)
      .slice(offset * UPSTREAM, (offset + 1) * UPSTREAM)
      .map((name, i) => ({
        ticket_tag_id: offset * UPSTREAM + i + 1,
        tag_company_id: 153909,
        name,
        ticket_count: 1,
      }))
  }
}

describe('usedesk listTags', () => {
  const run = (p: QueryParams) => adapter.listTags(creds, p)

  it('pages POST /tags by offset, sending only offset', async () => {
    handler = tags(5)
    const rows = await run(withPageSink({ page: 1, limit: 10 }))
    expect(calls).toEqual([{ path: '/tags', body: { offset: 0, api_token: 'tok' } }])
    expect(rows.map((r) => r.id)).toEqual(range(5, 't'))
    expect(rows.map((r) => r.externalId)).toEqual(range(5))
  })

  it('serves every tag once across pages of 2L+1 rows', async () => {
    const L = 10
    handler = tags(2 * L + 1)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1, 't'))
    expect(hasMore).toEqual([true, true, false])
  })

  it('serves every tag once when caller pages span uneven upstream pages of 100', async () => {
    const L = 70
    handler = tags(2 * L + 1)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1, 't'))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.body['offset'])).toContain(1)
  })

  it('an exact multiple of 100 ends on the last page', async () => {
    handler = tags(200)
    const { ids, hasMore } = await walk(run, 100)
    expect(ids).toEqual(range(200, 't'))
    expect(hasMore).toEqual([true, false, false])
  })

  it('throws on an error body instead of reading it as an empty list', async () => {
    // Article 51419: errors come back with status 200 and an error body.
    handler = () => ({ status: 'error', code: 111 })
    await expect(run(withPageSink({ page: 1, limit: 10 }))).rejects.toThrow(/not an array/)
  })

  it('does not share a pager with tickets on the same connection', async () => {
    const tagRows = tags(5)
    handler = (call: Call) =>
      call.path === '/tickets'
        ? range(5, 'k').map((id) => ({
            id,
            subject: 's',
            status: '1',
            created_at: '2017-03-01 14:30:49',
          }))
        : tagRows(call)
    const params = () => withPageSink({ page: 1, limit: 10 })
    const [tickets, tagList] = await Promise.all([
      adapter.listTickets(creds, params()),
      adapter.listTags(creds, params()),
    ])
    expect(tickets.map((r) => r.id)).toEqual(range(5, 'k'))
    expect(tagList.map((r) => r.id)).toEqual(range(5, 't'))
  })

  it("keeps one connection's tags away from another token", async () => {
    handler = tags(100, 'a')
    await run(withPageSink({ page: 1, limit: 20 }))
    handler = tags(100, 'b')
    calls = []
    const rows = await adapter.listTags(
      { accessToken: 'other' },
      withPageSink({ page: 2, limit: 20 }),
    )
    expect(rows.map((r) => r.id)).toEqual(range(40, 'b').slice(20))
    expect(calls.length).toBeGreaterThan(0)
  })
})

describe('usedesk getTag', () => {
  it('refuses with 501 NOT_SUPPORTED and sends nothing', async () => {
    handler = () => {
      throw new Error('no request expected')
    }
    await expect(adapter.getTag(creds, 'tag1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toEqual([])
  })
})
