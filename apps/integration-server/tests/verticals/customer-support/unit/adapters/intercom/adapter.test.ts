/**
 * The Intercom data layer against a fake that honours only what the docs
 * describe (https://developers.intercom.com/docs/build-an-integration/learn-more/rest-apis/pagination):
 *
 * - list APIs take `per_page` (max 150) and `starting_after` as query params;
 * - search APIs take `{ query, pagination: { per_page, starting_after } }` as
 *   a POST body;
 * - every page carries `pages.next.starting_after` while more remain, and no
 *   `next` object on the last page;
 * - admins, teams and tags come back whole, with no paging parameters.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  _resetCursorPager,
  type QueryParams,
} from '@opensteward/shared'
import { IntercomAdapter } from '../../../../../../src/verticals/customer-support/adapters/intercom/index'
import { TicketSchema } from '../../../../../../src/verticals/customer-support/schema/ticket'
import { MessageSchema } from '../../../../../../src/verticals/customer-support/schema/message'

const CFG = { clientId: 'c', clientSecret: 's', redirectUri: 'https://x.test/cb' }
const CREDS = { accessToken: 'tok-a', extra: { region: 'eu' } }
const MAX = 150

type Row = Record<string, unknown>
interface Call {
  method: 'GET' | 'POST'
  path: string
  params?: Record<string, unknown>
  body?: Record<string, unknown>
}

function upstreamError(status: number, message: string): Error {
  return Object.assign(new Error(message), { response: { status } })
}

const cursorFor = (offset: number) => Buffer.from(`at:${offset}`).toString('base64')
const offsetOf = (cursor: string) => Number(Buffer.from(cursor, 'base64').toString().slice(3))

function cursorPage(key: string, rows: Row[], perPage: unknown, after: unknown) {
  const n = perPage === undefined ? 20 : Number(perPage)
  if (!Number.isInteger(n) || n < 1 || n > MAX)
    throw upstreamError(400, `per_page must be 1..${MAX}`)
  const start = after === undefined ? 0 : offsetOf(String(after))
  const slice = rows.slice(start, start + n)
  const end = start + slice.length
  return {
    type: 'list',
    [key]: slice,
    total_count: rows.length,
    pages: {
      type: 'pages',
      page: Math.floor(start / n) + 1,
      per_page: n,
      total_pages: Math.ceil(rows.length / n),
      ...(end < rows.length
        ? { next: { page: Math.floor(end / n) + 1, starting_after: cursorFor(end) } }
        : {}),
    },
  }
}

interface World {
  conversations?: Row[]
  contacts?: Row[]
  macros?: Row[]
  admins?: Row[]
  teams?: Row[]
  tags?: Row[]
  conversation?: Row
}

function fakeIntercom(world: World) {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = { ...(cfg?.params ?? {}) }
    calls.push({ method: 'GET', path, params })
    if (path === '/conversations')
      return {
        data: cursorPage(
          'conversations',
          world.conversations ?? [],
          params['per_page'],
          params['starting_after'],
        ),
      }
    if (path === '/contacts')
      return {
        data: cursorPage(
          'data',
          world.contacts ?? [],
          params['per_page'],
          params['starting_after'],
        ),
      }
    if (path === '/macros')
      return {
        data: cursorPage('data', world.macros ?? [], params['per_page'], params['starting_after']),
      }
    if (path === '/admins') return { data: { type: 'admin.list', admins: world.admins ?? [] } }
    if (path === '/teams') return { data: { type: 'team.list', teams: world.teams ?? [] } }
    if (path === '/tags') return { data: { type: 'list', data: world.tags ?? [] } }
    if (path.startsWith('/conversations/') && world.conversation)
      return { data: world.conversation }
    throw upstreamError(404, `no such endpoint ${path}`)
  })
  const post = vi.fn(async (path: string, body?: Record<string, unknown>) => {
    calls.push({ method: 'POST', path, body })
    const pagination = (body?.['pagination'] ?? {}) as Record<string, unknown>
    if (path === '/conversations/search')
      return {
        data: cursorPage(
          'conversations',
          world.conversations ?? [],
          pagination['per_page'],
          pagination['starting_after'],
        ),
      }
    if (path === '/contacts/search')
      return {
        data: cursorPage(
          'data',
          world.contacts ?? [],
          pagination['per_page'],
          pagination['starting_after'],
        ),
      }
    throw upstreamError(404, `no such endpoint ${path}`)
  })
  const create = vi.spyOn(axios, 'create').mockReturnValue({ get, post } as never)
  return { calls, create }
}

const conv = (i: number): Row => ({
  type: 'conversation',
  id: String(1000 + i),
  created_at: 1734537460 + i,
  updated_at: 1734537460 + i,
  state: 'open',
  source: { type: 'conversation', id: `src-${i}`, body: 'hi', author: { type: 'user', id: 'u1' } },
  contacts: { type: 'contact.list', contacts: [{ type: 'contact', id: 'c1' }] },
})

const params = (p: QueryParams): QueryParams => withPageSink({ ...p })

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('IntercomAdapter HTTP client', () => {
  it('pins Intercom-Version 2.16 and uses the region’s API host', async () => {
    const { create } = fakeIntercom({ admins: [] })
    await new IntercomAdapter(CFG).listUsers(CREDS, params({ limit: 10 }))
    const cfg = create.mock.calls[0]?.[0] as { baseURL: string; headers: Record<string, string> }
    expect(cfg.baseURL).toBe('https://api.eu.intercom.io')
    expect(cfg.headers['Intercom-Version']).toBe('2.16')
    expect(cfg.headers['Authorization']).toBe('Bearer tok-a')
  })

  it.each([
    [{ region: 'us' }, 'https://api.intercom.io'],
    [{ region: 'au' }, 'https://api.au.intercom.io'],
    [{}, 'https://api.intercom.io'],
  ])('extra %j → %s', async (extra, host) => {
    const { create } = fakeIntercom({ admins: [] })
    await new IntercomAdapter(CFG).listUsers({ accessToken: 't', extra }, params({ limit: 10 }))
    expect((create.mock.calls[0]?.[0] as { baseURL: string }).baseURL).toBe(host)
  })

  it('refuses a stored region it does not know', async () => {
    fakeIntercom({ admins: [] })
    await expect(
      new IntercomAdapter(CFG).listUsers(
        { accessToken: 't', extra: { region: 'ca' } },
        params({ limit: 10 }),
      ),
    ).rejects.toThrow(/must be one of us, eu or au/)
  })
})

describe('listTickets (conversations)', () => {
  const world = { conversations: Array.from({ length: 25 }, (_, i) => conv(i)) }

  it('walks starting_after: every conversation once, hasMore exact, per_page = limit', async () => {
    const { calls } = fakeIntercom(world)
    const adapter = new IntercomAdapter(CFG)
    const ids: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const p = params({ page, limit: 10 })
      const rows = await adapter.listTickets(CREDS, p)
      rows.forEach((t) => TicketSchema.parse(t))
      ids.push(...rows.map((t) => t.id))
      more.push(readUpstreamPage(p)?.hasMore)
    }
    expect(ids).toEqual(world.conversations.map((c) => c['id']))
    expect(more).toEqual([true, true, false])
    expect(calls.every((c) => c.method === 'GET' && c.path === '/conversations')).toBe(true)
    expect(calls.map((c) => c.params?.['per_page'])).toEqual([10, 10, 10])
    expect(calls[0]?.params?.['starting_after']).toBeUndefined()
    expect(calls[1]?.params?.['starting_after']).toBe(cursorFor(10))
  })

  it('never asks for more than the caller’s limit (no limit+1 probe)', async () => {
    const { calls } = fakeIntercom(world)
    await new IntercomAdapter(CFG).listTickets(CREDS, params({ page: 1, limit: 7 }))
    expect(calls[0]?.params?.['per_page']).toBe(7)
  })

  it('clamps to the documented 150 and reports the size it sent', async () => {
    const { calls } = fakeIntercom(world)
    const p = params({ page: 1, limit: 500 })
    await new IntercomAdapter(CFG).listTickets(CREDS, p)
    expect(calls[0]?.params?.['per_page']).toBe(150)
    expect(readUpstreamPage(p)?.pageSize).toBe(150)
  })

  it('honours an explicit cursor', async () => {
    const { calls } = fakeIntercom(world)
    const rows = await new IntercomAdapter(CFG).listTickets(
      CREDS,
      params({ limit: 10, cursor: cursorFor(20) }),
    )
    expect(rows.map((t) => t.id)).toEqual(['1020', '1021', '1022', '1023', '1024'])
    expect(calls[0]?.params?.['starting_after']).toBe(cursorFor(20))
  })

  it('sends updated_after to Search conversations on updated_at, one second early, paged in the body', async () => {
    const { calls } = fakeIntercom(world)
    const adapter = new IntercomAdapter(CFG)
    const since = new Date('2026-09-01T00:00:10Z')
    await adapter.listTickets(CREDS, params({ page: 1, limit: 10, updatedAfter: since }))
    await adapter.listTickets(CREDS, params({ page: 2, limit: 10, updatedAfter: since }))
    expect(calls).toHaveLength(2)
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/conversations/search',
      body: {
        query: { field: 'updated_at', operator: '>', value: since.getTime() / 1000 - 1 },
        pagination: { per_page: 10 },
      },
    })
    expect(calls[1]?.body?.['pagination']).toEqual({ per_page: 10, starting_after: cursorFor(10) })
  })
})

describe('listContacts', () => {
  const world = {
    contacts: Array.from({ length: 12 }, (_, i) => ({
      type: 'contact',
      id: `c${i}`,
      role: 'user',
    })),
  }

  it('pages GET /contacts by per_page and starting_after', async () => {
    const { calls } = fakeIntercom(world)
    const adapter = new IntercomAdapter(CFG)
    const a = await adapter.listContacts(CREDS, params({ page: 1, limit: 5 }))
    const b = await adapter.listContacts(CREDS, params({ page: 2, limit: 5 }))
    const c = await adapter.listContacts(CREDS, params({ page: 3, limit: 5 }))
    expect([...a, ...b, ...c].map((r) => r.id)).toEqual(world.contacts.map((r) => r.id))
    expect(calls.map((x) => x.params?.['starting_after'])).toEqual([
      undefined,
      cursorFor(5),
      cursorFor(10),
    ])
  })

  it('searches updated_at two days early: contact search matches by workspace-local calendar day', async () => {
    const { calls } = fakeIntercom(world)
    const since = new Date('2026-09-10T12:00:00Z')
    await new IntercomAdapter(CFG).listContacts(
      CREDS,
      params({ page: 1, limit: 5, updatedAfter: since }),
    )
    expect(calls[0]?.path).toBe('/contacts/search')
    expect(calls[0]?.body?.['query']).toEqual({
      field: 'updated_at',
      operator: '>',
      // One day is not enough: on a 25-hour DST day a bound 24 h early can
      // still fall on updatedAfter's own local day, and `>` then skips it.
      value: since.getTime() / 1000 - 2 * 86_400,
    })
  })
})

describe('listMacros', () => {
  it('sends updated_since for updated_after, one second early', async () => {
    const { calls } = fakeIntercom({
      macros: [{ type: 'macro', id: 'm1', name: 'Hi', body_text: 'Hi' }],
    })
    const since = new Date('2026-09-10T12:00:00Z')
    const rows = await new IntercomAdapter(CFG).listMacros(
      CREDS,
      params({ page: 1, limit: 10, updatedAfter: since }),
    )
    expect(rows.map((m) => m.id)).toEqual(['m1'])
    expect(calls[0]?.params).toEqual({ per_page: 10, updated_since: since.getTime() / 1000 - 1 })
  })
})

describe('whole lists paged locally (admins, teams, tags)', () => {
  const admins = Array.from({ length: 5 }, (_, i) => ({
    type: 'admin',
    id: String(i),
    name: `A${i}`,
    team_ids: [],
  }))

  it('slices each page from one request and reports the total', async () => {
    const { calls } = fakeIntercom({ admins })
    const adapter = new IntercomAdapter(CFG)
    const p1 = params({ page: 1, limit: 2 })
    const p3 = params({ page: 3, limit: 2 })
    expect((await adapter.listUsers(CREDS, p1)).map((u) => u.id)).toEqual(['0', '1'])
    expect((await adapter.listUsers(CREDS, p3)).map((u) => u.id)).toEqual(['4'])
    expect(readUpstreamPage(p1)).toMatchObject({ totalCount: 5, hasMore: true, pagedLocally: true })
    expect(readUpstreamPage(p3)).toMatchObject({ totalCount: 5, hasMore: false })
    expect(
      calls.every((c) => c.path === '/admins' && Object.keys(c.params ?? {}).length === 0),
    ).toBe(true)
  })

  it('teams and tags read their documented envelopes', async () => {
    fakeIntercom({
      teams: [{ type: 'team', id: 't1', name: 'Support', admin_ids: [1, 2] }],
      tags: [{ type: 'tag', id: '9', name: 'vip' }],
    })
    const adapter = new IntercomAdapter(CFG)
    expect(await adapter.listTeams(CREDS, params({ limit: 10 }))).toMatchObject([
      { id: 't1', memberCount: 2 },
    ])
    expect(await adapter.listTags(CREDS, params({ limit: 10 }))).toMatchObject([
      { id: '9', name: 'vip' },
    ])
  })
})

describe('listMessages', () => {
  const conversation = {
    type: 'conversation',
    id: '471',
    created_at: 1734537460,
    source: {
      type: 'conversation',
      id: '403918320',
      body: 'this is the message body',
      author: { type: 'user', id: 'u1' },
      attachments: [],
    },
    conversation_parts: {
      type: 'conversation_part.list',
      total_count: 4,
      conversation_parts: [
        {
          type: 'conversation_part',
          id: 'p1',
          part_type: 'comment',
          body: 'reply',
          created_at: 1734537470,
          author: { type: 'admin', id: '99' },
          attachments: [],
        },
        {
          type: 'conversation_part',
          id: 'p2',
          part_type: 'assignment',
          body: null,
          created_at: 1734537480,
          author: { type: 'admin', id: '99' },
        },
        {
          type: 'conversation_part',
          id: 'p3',
          part_type: 'note',
          body: 'internal',
          created_at: 1734537490,
          author: { type: 'admin', id: '99' },
          attachments: [{ type: 'upload' }],
        },
        {
          type: 'conversation_part',
          id: 'p4',
          part_type: 'close',
          body: null,
          created_at: 1734537500,
          author: { type: 'bot', id: '1' },
        },
      ],
    },
  }

  it('serves the source plus comment/note parts, asks for plain text, pages locally', async () => {
    const { calls } = fakeIntercom({ conversation })
    const p = params({ page: 1, limit: 10 })
    const rows = await new IntercomAdapter(CFG).listMessages(CREDS, '471', p)
    rows.forEach((m) => MessageSchema.parse(m))
    expect(rows.map((m) => [m.id, m.type, m.authorType])).toEqual([
      ['403918320', 'public', 'contact'],
      ['p1', 'public', 'user'],
      ['p3', 'internal', 'user'],
    ])
    expect(rows.every((m) => m.ticketId === '471')).toBe(true)
    expect(calls).toEqual([
      { method: 'GET', path: '/conversations/471', params: { display_as: 'plaintext' } },
    ])
    expect(readUpstreamPage(p)).toMatchObject({ totalCount: 3, hasMore: false, pagedLocally: true })
  })
})

describe('refusals', () => {
  it('getMessage refuses with 501 NOT_SUPPORTED before any request', async () => {
    const { calls, create } = fakeIntercom({})
    await expect(new IntercomAdapter(CFG).getMessage(CREDS, 'p1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toHaveLength(0)
    expect(create).not.toHaveBeenCalled()
  })
})

describe('single-record reads hit the documented paths', () => {
  it.each([
    ['getTicket', '/conversations/12'],
    ['getContact', '/contacts/12'],
    ['getUser', '/admins/12'],
    ['getTeam', '/teams/12'],
    ['getTag', '/tags/12'],
    ['getMacro', '/macros/12'],
  ] as const)('%s → GET %s', async (method, path) => {
    const get = vi.fn(async (_path: string) => ({ data: { id: '12', name: 'n' } }))
    vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
    const out = await new IntercomAdapter(CFG)[method](CREDS, '12')
    expect(out.id).toBe('12')
    expect(get.mock.calls[0]?.[0]).toBe(path)
  })
})
