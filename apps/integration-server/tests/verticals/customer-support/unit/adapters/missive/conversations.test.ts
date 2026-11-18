/**
 * Missive listTickets / getTicket → GET /v1/conversations, GET /v1/conversations/:id.
 *
 * From https://missiveapp.com/docs/developers/rest-api/endpoints (List conversations):
 *   "At least one mailbox filter is required. Omitting all of them returns a
 *    "You need to paginate at least one mailbox" error. Pass one of: inbox , all ,
 *    assigned , closed , snoozed , flagged , trashed , junked , drafts ,
 *    shared_label , team_inbox , team_closed , or team_all ."
 *   "Returns conversations ordered from newest to oldest activity. To paginate,
 *    pass an until param equal to the last_activity_at of the oldest conversation
 *    returned in the previous page. The last page is reached when fewer
 *    conversations than limit are returned or if all conversations in a page have
 *    the same last_activity_at ."
 *   "A page may return more conversations than limit . Conversations where the API
 *    token user is a guest will be returned with limited data, containing only the
 *    id and last_activity_at fields."
 *   limit: "Number of conversations returned. Default: 25 . Max: 50 ."
 *   all:   "Pass true to list conversations in the All mailbox."
 * Get a conversation answers `{ "conversations": [ { … } ] }` (documented example).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { MissiveAdapter } from '../../../../../../src/verticals/customer-support/adapters/missive/index'
import { TicketSchema } from '../../../../../../src/verticals/customer-support/schema/ticket'

const CREDS = { accessToken: 'missive_pat-test' }
const MAX = 50
const DEFAULT = 25
const MAILBOX_FILTERS = [
  'inbox',
  'all',
  'assigned',
  'closed',
  'snoozed',
  'flagged',
  'trashed',
  'junked',
  'drafts',
  'shared_label',
  'team_inbox',
  'team_closed',
  'team_all',
]
const DOCUMENTED = [
  'limit',
  'until',
  ...MAILBOX_FILTERS,
  'organization',
  'email',
  'domain',
  'contact_organization',
]

type Call = { path: string; params: Record<string, unknown> }

function refuse(message: string): never {
  throw Object.assign(new Error(message), { response: { status: 400 } })
}

function conversation(i: number, t: number, guest: boolean) {
  const id = `conv-${i + 1}`
  if (guest) return { id, last_activity_at: t }
  return {
    id,
    created_at: t - 100,
    subject: `s${i + 1}`,
    latest_message_subject: null,
    authors: [{ name: 'Samwise Gamgee', address: 'sam@fellowship.org' }],
    external_authors: [{ name: 'Samwise Gamgee', address: 'sam@fellowship.org' }],
    users: [],
    assignees: [],
    assignee_names: '',
    assignee_emails: '',
    shared_labels: [],
    shared_label_names: '',
    messages_count: 1,
    drafts_count: 0,
    send_later_messages_count: 0,
    attachments_count: 0,
    tasks_count: 0,
    completed_tasks_count: 0,
    last_activity_at: t,
    web_url: `https://mail.missiveapp.com/#inbox/conversations/${id}`,
    app_url: `missive://mail.missiveapp.com/#inbox/conversations/${id}`,
  }
}

/**
 * A fake Missive honouring ONLY the documented List conversations parameters:
 * it refuses a call with no mailbox filter the way the docs say, `limit` 1..50
 * (default 25), `until` inclusive (a conversation at exactly `until` comes back
 * again: the docs do not say it is excluded). Newest first; `times[i]` is
 * conversation i's last_activity_at, `guests` the indices returned with only
 * id and last_activity_at, `extra` makes a page return that many more rows than
 * limit ("A page may return more conversations than limit").
 */
function fakeMissive(
  n: number,
  opts: { times?: number[]; guests?: number[]; extra?: number } = {},
) {
  const calls: Call[] = []
  const all = Array.from({ length: n }, (_, i) =>
    conversation(i, opts.times?.[i] ?? 1_700_000_000 - i, opts.guests?.includes(i) ?? false),
  )
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    calls.push({ path, params })
    if (path === '/conversations') {
      for (const k of Object.keys(params)) {
        if (!DOCUMENTED.includes(k)) refuse(`undocumented param ${k} on ${path}`)
      }
      if (!MAILBOX_FILTERS.some((k) => params[k] !== undefined))
        refuse('You need to paginate at least one mailbox')
      if (params['all'] !== undefined && params['all'] !== true) refuse('all: pass true')
      const limit = params['limit'] ?? DEFAULT
      if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX)
        refuse(`limit must be 1..${MAX} (got ${String(limit)})`)
      const until = params['until']
      const eligible =
        until === undefined ? all : all.filter((c) => c.last_activity_at <= Number(until))
      return { data: { conversations: eligible.slice(0, limit + (opts.extra ?? 0)) } }
    }
    const one = /^\/conversations\/([^/]+)$/.exec(path)?.[1]
    if (one !== undefined) {
      if (Object.keys(params).length > 0) refuse(`undocumented params on ${path}`)
      const c = all.find((x) => x.id === decodeURIComponent(one))
      if (!c) throw Object.assign(new Error('not found'), { response: { status: 404 } })
      return { data: { conversations: [c] } }
    }
    throw new Error(`unexpected GET ${path}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  return calls
}

async function walk(L: number, pages: number[]) {
  const adapter = new MissiveAdapter()
  const seen: string[] = []
  const more: Array<boolean | undefined> = []
  for (const page of pages) {
    const params: QueryParams = withPageSink({ page, limit: L })
    const rows = await adapter.listTickets(CREDS, params)
    seen.push(...rows.map((r) => TicketSchema.parse(r).id))
    more.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, more }
}

const ids = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `conv-${from + i}`)

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('Missive listTickets (List conversations)', () => {
  it('sends the documented All mailbox filter and the documented max limit', async () => {
    const calls = fakeMissive(3)
    const rows = await new MissiveAdapter().listTickets(CREDS, withPageSink({ page: 1, limit: 2 }))
    expect(calls[0]).toEqual({ path: '/conversations', params: { all: true, limit: MAX } })
    expect(rows.map((r) => r.id)).toEqual(['conv-1', 'conv-2'])
  })

  it('2L+1 conversations over pages 1..3 at limit L: every id once, in order, hasMore exact', async () => {
    const L = 4
    fakeMissive(2 * L + 1)
    const { seen, more } = await walk(L, [1, 2, 3])
    expect(seen).toEqual(ids(1, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('walks past one upstream page with until = the oldest last_activity_at; a boundary row is served once', async () => {
    // 2*50+1 rows: two full upstream pages and a short one; the inclusive
    // until returns conv-50 and conv-99 again.
    const calls = fakeMissive(101)
    const { seen, more } = await walk(40, [1, 2, 3])
    expect(seen).toEqual(ids(1, 101))
    expect(more).toEqual([true, true, false])
    expect(calls.map((c) => c.params['until'])).toEqual([
      undefined,
      1_700_000_000 - 49,
      1_700_000_000 - 98,
    ])
    expect(calls.every((c) => c.params['all'] === true && c.params['limit'] === MAX)).toBe(true)
  })

  it('an uneven upstream page (more rows than limit, as documented) is served whole, once', async () => {
    fakeMissive(120, { extra: 3 })
    const { seen, more } = await walk(50, [1, 2, 3])
    expect(seen).toEqual(ids(1, 120))
    expect(more).toEqual([true, true, false])
  })

  it('a full page whose conversations share one last_activity_at is the last page (documented)', async () => {
    const calls = fakeMissive(60, { times: Array(60).fill(1_700_000_000) })
    const params = withPageSink({ page: 1, limit: 50 })
    const rows = await new MissiveAdapter().listTickets(CREDS, params)
    expect(rows).toHaveLength(50)
    expect(calls).toHaveLength(1)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a limit above the documented 50 is clamped upstream and served whole', async () => {
    const calls = fakeMissive(120)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await new MissiveAdapter().listTickets(CREDS, params)
    expect(calls.every((c) => c.params['limit'] === MAX)).toBe(true)
    expect(rows.map((r) => r.id)).toEqual(ids(1, 120))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('with no caller limit, serves the documented default of 25', async () => {
    fakeMissive(60)
    const rows = await new MissiveAdapter().listTickets(CREDS, withPageSink({ page: 1 }))
    expect(rows).toHaveLength(DEFAULT)
  })

  it('guest rows ("only id and last_activity_at") are skipped but still place the until cursor', async () => {
    // conv-50, the oldest of upstream page 1, is a guest row: page 2 starts from its time.
    const calls = fakeMissive(60, { guests: [2, 49] })
    const { seen } = await walk(60, [1])
    expect(seen).toEqual(ids(1, 60).filter((id) => id !== 'conv-3' && id !== 'conv-50'))
    expect(calls[1]!.params['until']).toBe(1_700_000_000 - 49)
  })

  it('walks are scoped per connection: another token fetches its own rows', async () => {
    const calls = fakeMissive(9)
    const adapter = new MissiveAdapter()
    await adapter.listTickets(CREDS, withPageSink({ page: 1, limit: 4 }))
    const before = calls.length
    await adapter.listTickets(
      { accessToken: 'missive_pat-other' },
      withPageSink({ page: 2, limit: 4 }),
    )
    expect(calls.length).toBeGreaterThan(before)
  })
})

describe('Missive getTicket (Get a conversation)', () => {
  it('reads the documented conversations array', async () => {
    const calls = fakeMissive(3)
    const t = await new MissiveAdapter().getTicket(CREDS, 'conv-2')
    expect(calls).toEqual([{ path: '/conversations/conv-2', params: {} }])
    const parsed = TicketSchema.parse(t)
    expect(parsed.id).toBe('conv-2')
    // conv-2 has last_activity_at 1_699_999_999 and created_at 100 s earlier.
    expect(parsed.updatedAt).toBe(new Date(1_699_999_999 * 1000).toISOString())
    expect(parsed.createdAt).toBe(new Date(1_699_999_899 * 1000).toISOString())
  })

  it('URI-encodes the conversation id into the path', async () => {
    const get = vi.fn(async () => ({ data: { conversations: [] } }))
    vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
    await expect(new MissiveAdapter().getTicket(CREDS, 'a/b?c')).rejects.toThrow(/not found/)
    expect(get.mock.calls.map((c: unknown[]) => c[0])).toEqual(['/conversations/a%2Fb%3Fc'])
  })

  it('the documented Get a conversation example (no created_at) fails naming the missing field', async () => {
    // Verbatim "Get a conversation" example response. The properties table
    // marks created_at "always present", but this example leaves it out; the
    // canonical Ticket requires it, so the adapter throws instead of inventing
    // a date, and the error does not claim the token user is a guest.
    const DOC_GET_RESPONSE = {
      conversations: [
        {
          id: '6d3c9b1c-7067-4a28-8ea6-ea91340b67cc',
          subject: null,
          latest_message_subject: 'Question?',
          organization: { id: '96cafdc6-ec6a-4439-9b0c-f55a1133b1e7', name: 'Conference Badge' },
          color: null,
          assignees: [],
          users: [
            {
              id: 'dc3c4104-eced-4206-b532-ef84b331778a',
              name: 'Chad Zemlak',
              email: 'chad@conferencebade.com',
              unassigned: false,
              closed: false,
              archived: false,
              trashed: false,
              junked: false,
              assigned: false,
              flagged: true,
              snoozed: false,
            },
          ],
          attachments_count: 0,
          messages_count: 1,
          authors: [{ name: 'Samwise Gamgee', address: 'sam@fellowship.org' }],
          drafts_count: 0,
          send_later_messages_count: 0,
          tasks_count: 0,
          completed_tasks_count: 0,
          web_url:
            'https://mail.missiveapp.com/#inbox/conversations/6d3c9b1c-7067-4a28-8ea6-ea91340b67cc',
          app_url:
            'missive://mail.missiveapp.com/#inbox/conversations/6d3c9b1c-7067-4a28-8ea6-ea91340b67cc',
          assignee_names: '',
          assignee_emails: '',
          shared_label_names: '',
          last_activity_at: 1654544954,
          team: {
            id: 'f36b7570-078e-408e-9cb8-2b4441ad93c0',
            name: 'Team 1',
            organization: '96cafdc6-ec6a-4439-9b0c-f55a1133b1e7',
            active_members: ['dc3c4104-eced-4206-b532-ef84b331778a'],
            observers: [],
          },
          shared_labels: [],
        },
      ],
    }
    vi.spyOn(axios, 'create').mockReturnValue({
      get: vi.fn(async () => ({ data: DOC_GET_RESPONSE })),
      post: vi.fn(),
    } as never)
    const err = await new MissiveAdapter()
      .getTicket(CREDS, '6d3c9b1c-7067-4a28-8ea6-ea91340b67cc')
      .catch((e: unknown) => e as Error)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/has no created_at/)
    expect((err as Error).message).not.toMatch(/guest in it/)
  })

  it('an empty conversations array is not found', async () => {
    vi.spyOn(axios, 'create').mockReturnValue({
      get: vi.fn(async () => ({ data: { conversations: [] } })),
      post: vi.fn(),
    } as never)
    await expect(new MissiveAdapter().getTicket(CREDS, 'x')).rejects.toThrow(/not found/)
  })
})
