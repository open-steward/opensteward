/**
 * Missive list paging: 1-based `page` + caller's `limit` → Missive's `limit` +
 * `offset` (contacts, users, shared labels, teams, responses) or `limit` +
 * `until` (a conversation's messages).
 *
 * From https://missiveapp.com/docs/developers/rest-api/endpoints:
 *
 *   List users (GET /v1/users), and alike for List shared labels, List teams,
 *   List responses and List contacts:
 *     limit:  "50 Number of users returned. Max value: 200"
 *     offset: "0 Offset used to paginate."
 *   List contacts: "contact_book * Contact book ID"
 *
 *   List messages (GET /v1/conversations/:id/messages):
 *     "Returns messages ordered from newest to oldest. To paginate, pass an until
 *      param equal to the delivered_at of the oldest message returned in the
 *      previous page. The last page is reached when fewer messages than limit are
 *      returned or if all messages in a page have the same delivered_at ."
 *     limit: "Number of messages returned. Default: 10 . Max: 10"
 *
 * listTickets (GET /v1/conversations) is paged in missive/conversations.test.ts.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { MissiveAdapter } from '../../../../../../src/verticals/customer-support/adapters/missive/index'

const CREDS = { accessToken: 'missive_pat-test' }
/** Documented: "Max value: 200", default 50. */
const MAX = 200
const DEFAULT = 50
/** Documented for messages: "Default: 10 . Max: 10". */
const MSG_MAX = 10

type Call = { path: string; params: Record<string, unknown> }

const OFFSET_KEYS: Record<string, string> = {
  '/contacts': 'contacts',
  '/users': 'users',
  '/shared_labels': 'shared_labels',
  '/teams': 'teams',
  '/responses': 'responses',
}

function refuse(message: string): never {
  throw Object.assign(new Error(message), { response: { status: 400 } })
}

/**
 * A fake Missive honouring ONLY the documented parameters: on the offset
 * endpoints `limit` (1..200, default 50), `offset` and (contacts)
 * `contact_book`; on messages `limit` (1..10, default 10) and `until`, where a
 * message whose delivered_at equals `until` is returned again (the docs do not
 * say it is excluded). `messageTimes` sets each message's delivered_at and
 * `noTimeAt` blanks one. `books` gives a contact book its own rows
 * (`contacts-<book>-<n>`), and a conversation other than c1 gets its own
 * messages (`<conversation>-m<n>`).
 */
function fakeMissive(sizes: {
  offset?: number
  messages?: number
  messageTimes?: number[]
  noTimeAt?: number
  books?: Record<string, number>
}) {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    calls.push({ path, params })
    const key = OFFSET_KEYS[path]
    if (key) {
      for (const k of Object.keys(params)) {
        if (!['limit', 'offset', ...(path === '/contacts' ? ['contact_book'] : [])].includes(k))
          refuse(`undocumented param ${k} on ${path}`)
      }
      const limit = params['limit'] ?? DEFAULT
      if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX)
        refuse(`limit must be 1..${MAX} (got ${String(limit)})`)
      const offset = Number(params['offset'] ?? 0)
      const book = path === '/contacts' ? String(params['contact_book'] ?? '') : ''
      const own = sizes.books?.[book]
      const all = Array.from({ length: own ?? sizes.offset ?? 0 }, (_, i) => ({
        id: own === undefined ? `${key}-${i + 1}` : `${key}-${book}-${i + 1}`,
        name: `n${i + 1}`,
      }))
      return { data: { [key]: all.slice(offset, offset + limit) } }
    }
    const conv = /^\/conversations\/([^/]+)\/messages$/.exec(path)?.[1]
    if (conv !== undefined) {
      for (const k of Object.keys(params)) {
        if (!['limit', 'until'].includes(k)) refuse(`undocumented param ${k} on ${path}`)
      }
      const limit = params['limit'] ?? MSG_MAX
      if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MSG_MAX)
        refuse(`limit must be 1..${MSG_MAX} (got ${String(limit)})`)
      const n = sizes.messages ?? 0
      // Newest first: message 1 is the newest.
      const all = Array.from({ length: n }, (_, i) => ({
        id: conv === 'c1' ? `m${i + 1}` : `${conv}-m${i + 1}`,
        type: 'email',
        delivered_at: i === sizes.noTimeAt ? null : (sizes.messageTimes?.[i] ?? 1_700_000_000 - i),
      }))
      const until = params['until']
      const eligible =
        until === undefined
          ? all
          : all.filter((m) => m.delivered_at !== null && m.delivered_at <= Number(until))
      return { data: { messages: eligible.slice(0, limit) } }
    }
    throw new Error(`unexpected GET ${path}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  return calls
}

type ListFn = (a: MissiveAdapter, p: QueryParams) => Promise<Array<{ id: string }>>

const OFFSET_LISTS: Array<[string, string, ListFn]> = [
  [
    'listContacts',
    '/contacts',
    (a, p) => a.listContacts(CREDS, Object.assign(p, { contactBook: 'cb1' })),
  ],
  ['listUsers', '/users', (a, p) => a.listUsers(CREDS, p)],
  ['listTags', '/shared_labels', (a, p) => a.listTags(CREDS, p)],
  ['listTeams', '/teams', (a, p) => a.listTeams(CREDS, p)],
  ['listMacros', '/responses', (a, p) => a.listMacros(CREDS, p)],
]

const ALL_LISTS: Array<[string, 'offset' | 'messages', ListFn]> = [
  ...OFFSET_LISTS.map(([name, , fn]) => [name, 'offset', fn] as [string, 'offset', ListFn]),
  ['listMessages', 'messages', (a, p) => a.listMessages(CREDS, 'c1', p)],
]

async function walk(list: ListFn, L: number, pages: number[]) {
  const adapter = new MissiveAdapter()
  const seen: string[] = []
  const more: Array<boolean | undefined> = []
  for (const page of pages) {
    const params = withPageSink({ page, limit: L })
    const rows = await list(adapter, params)
    seen.push(...rows.map((r) => r.id))
    more.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, more }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('Missive lists serve every row once, page by page', () => {
  for (const [name, resource, list] of ALL_LISTS) {
    it(`${name}: 2L+1 rows over pages 1..3 at limit L, in order, with hasMore exact`, async () => {
      const L = 4
      fakeMissive({ [resource]: 2 * L + 1 })
      const { seen, more } = await walk(list, L, [1, 2, 3])
      const prefix = seen[0]!.replace(/\d+$/, '')
      expect(seen).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => `${prefix}${i + 1}`))
      expect(more).toEqual([true, true, false])
    })
  }

  for (const [name, path, list] of OFFSET_LISTS) {
    it(`${name}: page 2 continues at the next documented offset, in pages of 200`, async () => {
      const calls = fakeMissive({ offset: 450 })
      const adapter = new MissiveAdapter()
      const p1 = await list(adapter, withPageSink({ page: 1, limit: 150 }))
      const p2 = await list(adapter, withPageSink({ page: 2, limit: 150 }))
      const sent = calls.filter((c) => c.path === path)
      expect(sent.map((c) => [c.params['limit'], c.params['offset']])).toEqual([
        [MAX, 0],
        [MAX, 200],
      ])
      const ids = [...p1, ...p2].map((r) => r.id)
      expect(new Set(ids).size).toBe(300)
      expect(ids.at(-1)).toMatch(/-300$/)
    })

    it(`${name}: a limit above the documented 200 is clamped`, async () => {
      const calls = fakeMissive({ offset: 450 })
      const rows = await list(new MissiveAdapter(), withPageSink({ page: 1, limit: 500 }))
      expect(calls.every((c) => c.params['limit'] === MAX)).toBe(true)
      expect(rows.map((r) => r.id)).toHaveLength(450)
    })
  }

  it('listContacts: contact_book goes on every page', async () => {
    const calls = fakeMissive({ offset: 9 })
    const adapter = new MissiveAdapter()
    await adapter.listContacts(CREDS, withPageSink({ page: 1, limit: 4, contactBook: 'cb1' }))
    await adapter.listContacts(CREDS, withPageSink({ page: 2, limit: 4, contactBook: 'cb1' }))
    expect(calls.every((c) => c.params['contact_book'] === 'cb1')).toBe(true)
  })

  it('a cold page 3 of users walks the offsets rather than repeating page 1', async () => {
    const calls = fakeMissive({ offset: 450 })
    const rows = await new MissiveAdapter().listUsers(CREDS, withPageSink({ page: 3, limit: 150 }))
    expect(rows.map((r) => r.id)).toEqual(
      Array.from({ length: 150 }, (_, i) => `users-${300 + i + 1}`),
    )
    expect(calls.map((c) => c.params['offset'])).toEqual([0, 200, 400])
  })

  it('offset walks are scoped per connection: another token fetches its own rows', async () => {
    const calls = fakeMissive({ offset: 9 })
    const adapter = new MissiveAdapter()
    await adapter.listUsers(CREDS, withPageSink({ page: 1, limit: 4 }))
    const before = calls.length
    await adapter.listUsers(
      { accessToken: 'missive_pat-other' },
      withPageSink({ page: 2, limit: 4 }),
    )
    expect(calls.length).toBeGreaterThan(before)
  })

  it('listMessages: page 2 sends until = the oldest delivered_at of the previous page', async () => {
    const calls = fakeMissive({ messages: 25 })
    const adapter = new MissiveAdapter()
    const p1 = await adapter.listMessages(CREDS, 'c1', withPageSink({ page: 1, limit: 10 }))
    const p2 = await adapter.listMessages(CREDS, 'c1', withPageSink({ page: 2, limit: 10 }))
    expect(p1.map((m) => m.id)).toEqual(Array.from({ length: 10 }, (_, i) => `m${i + 1}`))
    expect(p2.map((m) => m.id)).toEqual(Array.from({ length: 10 }, (_, i) => `m${i + 11}`))
    expect(calls[0]!.params).toEqual({ limit: MSG_MAX })
    expect(calls[1]!.params).toEqual({ limit: MSG_MAX, until: 1_700_000_000 - 9 })
  })

  it('listMessages: a limit above the documented 10 is clamped upstream, served whole', async () => {
    const calls = fakeMissive({ messages: 25 })
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await new MissiveAdapter().listMessages(CREDS, 'c1', params)
    expect(calls.every((c) => c.params['limit'] === MSG_MAX)).toBe(true)
    expect(rows.map((m) => m.id)).toEqual(Array.from({ length: 25 }, (_, i) => `m${i + 1}`))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('listMessages: a row returned again at the until boundary is served once', async () => {
    // m10 and m11 share a delivered_at, so page 2 (until = that time) returns m10 again.
    const times = Array.from({ length: 15 }, (_, i) => 1_700_000_000 - i)
    times[10] = times[9]!
    fakeMissive({ messages: 15, messageTimes: times })
    const { seen, more } = await walk((a, p) => a.listMessages(CREDS, 'c1', p), 5, [1, 2, 3])
    expect(seen).toEqual(Array.from({ length: 15 }, (_, i) => `m${i + 1}`))
    expect(more).toEqual([true, true, false])
  })

  it('listContacts: page 2 of another contact book fetches that book, not the cached one', async () => {
    const calls = fakeMissive({ books: { cb1: 9, cb2: 9 } })
    const adapter = new MissiveAdapter()
    await adapter.listContacts(CREDS, withPageSink({ page: 1, limit: 4, contactBook: 'cb1' }))
    const p2 = await adapter.listContacts(
      CREDS,
      withPageSink({ page: 2, limit: 4, contactBook: 'cb2' }),
    )
    expect(calls.map((c) => c.params['contact_book'])).toEqual(['cb1', 'cb2'])
    expect(p2.map((r) => r.id)).toEqual([
      'contacts-cb2-5',
      'contacts-cb2-6',
      'contacts-cb2-7',
      'contacts-cb2-8',
    ])
  })

  it('listMessages: page 2 of another conversation fetches that conversation', async () => {
    const calls = fakeMissive({ messages: 25 })
    const adapter = new MissiveAdapter()
    await adapter.listMessages(CREDS, 'c1', withPageSink({ page: 1, limit: 5 }))
    const p2 = await adapter.listMessages(CREDS, 'c2', withPageSink({ page: 2, limit: 5 }))
    // Page 2 of c2 is served from c2's own requests (one more peeks for hasMore).
    const [first, ...rest] = calls.map((c) => c.path)
    expect(first).toBe('/conversations/c1/messages')
    expect(rest.length).toBeGreaterThan(0)
    expect(rest.every((p) => p === '/conversations/c2/messages')).toBe(true)
    expect(p2.map((m) => m.id)).toEqual(['c2-m6', 'c2-m7', 'c2-m8', 'c2-m9', 'c2-m10'])
  })

  it('listMessages: a full page sharing one delivered_at is the last page (documented)', async () => {
    const calls = fakeMissive({ messages: 12, messageTimes: Array(12).fill(1_700_000_000) })
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await new MissiveAdapter().listMessages(CREDS, 'c1', params)
    expect(rows).toHaveLength(10)
    expect(calls).toHaveLength(1)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('listMessages: a page whose times do not all parse is not followed with a guessed until', async () => {
    // m10, the oldest on page 1, has no delivered_at, so the until to send is unknown.
    const calls = fakeMissive({ messages: 25, noTimeAt: 9 })
    const params = withPageSink({ page: 1, limit: 10 })
    await new MissiveAdapter().listMessages(CREDS, 'c1', params)
    expect(calls).toHaveLength(1)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('with no caller limit, offset lists serve the documented default of 50', async () => {
    fakeMissive({ offset: 450 })
    const rows = await new MissiveAdapter().listUsers(CREDS, withPageSink({ page: 1 }))
    expect(rows).toHaveLength(DEFAULT)
  })

  it('with no caller limit, listMessages serves the documented default of 10', async () => {
    fakeMissive({ messages: 25 })
    const rows = await new MissiveAdapter().listMessages(CREDS, 'c1', withPageSink({ page: 1 }))
    expect(rows).toHaveLength(MSG_MAX)
  })

  it('API path: parseListQuery → listUsers → listPage reports the next page', async () => {
    fakeMissive({ offset: 450 })
    const adapter = new MissiveAdapter()
    const params = parseListQuery({ limit: '100', page: '2' })
    const rows = await adapter.listUsers(CREDS, params)
    const env = listPage(rows, params, 'missive')
    expect(env.data.map((r) => r.id)).toEqual(
      Array.from({ length: 100 }, (_, i) => `users-${100 + i + 1}`),
    )
    expect(env.meta.hasMore).toBe(true)
  })
})
