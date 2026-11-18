/**
 * Pylon (slug gorgias-aircall) list paging: 1-based `page` + caller's `limit`
 * → Pylon's `limit` + `cursor` for issues, contacts and an issue's messages;
 * users, tags, teams and macros document no paging parameter, come back whole
 * and are paged locally.
 *
 * From https://docs.usepylon.com/pylon-docs/developer/api/api-reference/issues.md
 * (Get a list of issues, GET /issues):
 *
 *   cursor: "The cursor to use for pagination."
 *   limit:  "The number of issues to fetch. Defaults to 20000. Set to 0 or omit to use
 *            the default. Must be between 0 and 20000."
 *   start_time / end_time: "The duration between start_time and end_time must be less
 *            than or equal to 365 days."
 *
 * From https://docs.usepylon.com/pylon-docs/developer/api/api-reference/contacts.md
 * (Get all contacts, GET /contacts):
 *
 *   limit:  "The number of contacts to fetch. Defaults to 100. Must be greater than 0
 *            and less than 1000."
 *
 * From https://docs.usepylon.com/pylon-docs/developer/api/api-reference/messages.md
 * (Get messages on an issue, GET /issues/{id}/messages):
 *
 *   limit:  "The number of messages to fetch. Must be greater than 0 and at most 1000.
 *            If omitted, all messages are returned for backward compatibility."
 *
 * The next signal, on every one of those pages (Pagination schema):
 *   cursor: "The cursor for the next page of results."
 *   has_next_page: "Indicates if there is a next page of results."
 *
 * GET /users documents only `include_deactivated`, GET /macros only
 * `macro_group_id`, and GET /tags and GET /teams no query parameter at all.
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
import { GorgiasAircallAdapter } from '../../../../../../src/verticals/customer-support/adapters/gorgias-aircall/index'

const CREDS = { accessToken: 'pylon_test' }
/** Contacts: "greater than 0 and less than 1000". The smallest cursor-endpoint maximum. */
const MAX = 999
const MAX_ISSUES = 20000
const MAX_MESSAGES = 1000

type Call = { path: string; params: Record<string, unknown> }
type Resource = 'issues' | 'contacts' | 'messages' | 'users' | 'tags' | 'teams' | 'macros'

function refuse(msg: string): never {
  throw Object.assign(new Error(msg), { response: { status: 400 } })
}

/**
 * A fake Pylon honouring ONLY the documented parameters. On the cursor
 * endpoints `limit` is range-checked and `cursor` is opaque; the issues cursor
 * is minted under one time window and refused under another. The whole-list
 * endpoints refuse any parameter they do not document.
 */
function fakePylon(sizes: Partial<Record<Resource, number>>) {
  const calls: Call[] = []
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}` }))
  const encode = (offset: number, scope: string) =>
    Buffer.from(JSON.stringify({ offset, scope })).toString('base64')
  const decode = (c: unknown) =>
    JSON.parse(Buffer.from(String(c), 'base64').toString('utf8')) as {
      offset: number
      scope: string
    }

  const cursorList = (
    params: Record<string, unknown>,
    all: unknown[],
    opts: { max: number; min: number; dflt: number | 'all'; scope: string; allowed: string[] },
  ) => {
    for (const k of Object.keys(params)) {
      if (!opts.allowed.includes(k)) refuse(`undocumented param ${k}`)
    }
    const raw = params['limit']
    if (
      raw !== undefined &&
      (typeof raw !== 'number' || !Number.isInteger(raw) || raw < opts.min || raw > opts.max)
    ) {
      refuse(`limit out of range (got ${String(raw)})`)
    }
    const size =
      raw === undefined || raw === 0 ? (opts.dflt === 'all' ? all.length : opts.dflt) : raw
    let start = 0
    if (params['cursor'] !== undefined) {
      const c = decode(params['cursor'])
      if (c.scope !== opts.scope) refuse('cursor was minted under a different query')
      start = c.offset
    }
    const page = all.slice(start, start + size)
    const end = start + page.length
    const more = end < all.length
    return {
      data: {
        data: page,
        pagination: { cursor: more ? encode(end, opts.scope) : '', has_next_page: more },
      },
    }
  }

  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    calls.push({ path, params })
    if (path === '/issues') {
      const s = params['start_time']
      const e = params['end_time']
      if (typeof s !== 'string' || typeof e !== 'string')
        refuse('start_time and end_time are required')
      const span = Date.parse(e) - Date.parse(s)
      if (!(span >= 0 && span <= 365 * 24 * 3600 * 1000)) refuse('window must be <= 365 days')
      return cursorList(params, rows(sizes.issues ?? 0), {
        max: MAX_ISSUES,
        min: 0,
        dflt: MAX_ISSUES,
        scope: `${s}|${e}`,
        allowed: ['start_time', 'end_time', 'cursor', 'limit'],
      })
    }
    if (path === '/contacts') {
      return cursorList(params, rows(sizes.contacts ?? 0), {
        max: 999,
        min: 1,
        dflt: 100,
        scope: 'contacts',
        allowed: ['cursor', 'limit'],
      })
    }
    const msg = /^\/issues\/([^/]+)\/messages$/.exec(path)
    if (msg) {
      return cursorList(params, rows(sizes.messages ?? 0), {
        max: MAX_MESSAGES,
        min: 1,
        dflt: 'all',
        scope: `messages:${msg[1]}`,
        allowed: ['cursor', 'limit'],
      })
    }
    const whole: Record<string, [Resource, string[]]> = {
      '/users': ['users', ['include_deactivated']],
      '/tags': ['tags', []],
      '/teams': ['teams', []],
      '/macros': ['macros', ['macro_group_id']],
    }
    const hit = whole[path]
    if (hit) {
      for (const k of Object.keys(params)) {
        if (!hit[1].includes(k)) refuse(`undocumented param ${k} on ${path}`)
      }
      return { data: { data: rows(sizes[hit[0]] ?? 0) } }
    }
    throw new Error(`unexpected GET ${path}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  return calls
}

type ListFn = (a: GorgiasAircallAdapter, p: QueryParams) => Promise<Array<{ id: string }>>

const LISTS: Array<[string, Resource, ListFn]> = [
  ['listTickets', 'issues', (a, p) => a.listTickets(CREDS, p)],
  ['listContacts', 'contacts', (a, p) => a.listContacts(CREDS, p)],
  ['listMessages', 'messages', (a, p) => a.listMessages(CREDS, '42', p)],
  ['listUsers', 'users', (a, p) => a.listUsers(CREDS, p)],
  ['listTags', 'tags', (a, p) => a.listTags(CREDS, p)],
  ['listTeams', 'teams', (a, p) => a.listTeams(CREDS, p)],
  ['listMacros', 'macros', (a, p) => a.listMacros(CREDS, p)],
]

beforeEach(() => _resetCursorPager())
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('Pylon lists serve every row once, page by page', () => {
  for (const [name, resource, list] of LISTS) {
    it(`${name}: 2L+1 rows over pages 1..3 at limit L, in order, with hasMore exact`, async () => {
      const L = 4
      fakePylon({ [resource]: 2 * L + 1 })
      const adapter = new GorgiasAircallAdapter()
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const rows = await list(adapter, params)
        seen.push(...rows.map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => `r${i + 1}`))
      expect(more).toEqual([true, true, false])
    })
  }

  it('listContacts: page 2 sends the cursor from page 1, at the caller size', async () => {
    const calls = fakePylon({ contacts: 9 })
    const adapter = new GorgiasAircallAdapter()
    await adapter.listContacts(CREDS, withPageSink({ page: 1, limit: 4 }))
    await adapter.listContacts(CREDS, withPageSink({ page: 2, limit: 4 }))
    expect(calls).toHaveLength(2)
    expect(calls[0]!.params).toEqual({ limit: 4 })
    expect(calls[1]!.params['limit']).toBe(4)
    expect(typeof calls[1]!.params['cursor']).toBe('string')
  })

  it('listMessages: page 2 sends the cursor from page 1', async () => {
    const calls = fakePylon({ messages: 9 })
    const adapter = new GorgiasAircallAdapter()
    await adapter.listMessages(CREDS, '42', withPageSink({ page: 1, limit: 4 }))
    await adapter.listMessages(CREDS, '42', withPageSink({ page: 2, limit: 4 }))
    expect(calls).toHaveLength(2)
    expect(calls[1]!.params['cursor']).toBeTypeOf('string')
  })

  it('listTickets: page 2 carries the cursor AND the time window page 1 was served under', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
    const calls = fakePylon({ issues: 9 })
    const adapter = new GorgiasAircallAdapter()
    await adapter.listTickets(CREDS, withPageSink({ page: 1, limit: 4 }))
    // The clock moves between the pages; a default window recomputed from it
    // would no longer match the cursor.
    vi.setSystemTime(new Date('2026-09-01T12:00:05.123Z'))
    const rows = await adapter.listTickets(CREDS, withPageSink({ page: 2, limit: 4 }))
    expect(rows.map((r) => r.id)).toEqual(['r5', 'r6', 'r7', 'r8'])
    expect(calls).toHaveLength(2)
    expect(calls[1]!.params['cursor']).toBeTypeOf('string')
    expect(calls[1]!.params['start_time']).toBe(calls[0]!.params['start_time'])
    expect(calls[1]!.params['end_time']).toBe(calls[0]!.params['end_time'])
  })

  it('listTickets: a caller window is sent as given and pages under it', async () => {
    const calls = fakePylon({ issues: 9 })
    const adapter = new GorgiasAircallAdapter()
    const w = { start_time: '2026-01-01T00:00:00Z', end_time: '2026-02-01T00:00:00Z' }
    await adapter.listTickets(CREDS, withPageSink({ page: 1, limit: 4, ...w }))
    await adapter.listTickets(CREDS, withPageSink({ page: 2, limit: 4, ...w }))
    expect(calls.map((c) => [c.params['start_time'], c.params['end_time']])).toEqual([
      [w.start_time, w.end_time],
      [w.start_time, w.end_time],
    ])
  })

  it('a cold page 3 walks the cursor chain rather than repeating page 1', async () => {
    fakePylon({ contacts: 9 })
    const rows = await new GorgiasAircallAdapter().listContacts(
      CREDS,
      withPageSink({ page: 3, limit: 4 }),
    )
    expect(rows.map((r) => r.id)).toEqual(['r9'])
  })

  it('a limit above the documented maximum is clamped on every cursor endpoint', async () => {
    const calls = fakePylon({ contacts: 1200, messages: 1200 })
    const adapter = new GorgiasAircallAdapter()
    const c = await adapter.listContacts(CREDS, withPageSink({ page: 1, limit: 5000 }))
    const m = await adapter.listMessages(CREDS, '42', withPageSink({ page: 1, limit: 5000 }))
    expect(calls.map((x) => x.params['limit'])).toEqual([999, MAX_MESSAGES])
    expect(c).toHaveLength(999)
    expect(m).toHaveLength(MAX_MESSAGES)
  })

  it('the whole-list endpoints are sent no undocumented paging parameter', async () => {
    const calls = fakePylon({ users: 3, tags: 3, teams: 3, macros: 3 })
    const adapter = new GorgiasAircallAdapter()
    const p = () => withPageSink({ page: 1, limit: 2 })
    await adapter.listUsers(CREDS, p())
    await adapter.listTags(CREDS, p())
    await adapter.listTeams(CREDS, p())
    await adapter.listMacros(CREDS, p())
    expect(calls.map((c) => c.params)).toEqual([{}, {}, {}, {}])
  })

  it('cursors are scoped per connection: another token walks its own chain', async () => {
    const calls = fakePylon({ contacts: 9 })
    const adapter = new GorgiasAircallAdapter()
    await adapter.listContacts(CREDS, withPageSink({ page: 1, limit: 4 }))
    await adapter.listContacts({ accessToken: 'pylon_other' }, withPageSink({ page: 2, limit: 4 }))
    expect(calls).toHaveLength(3)
    expect(calls[1]!.params).toEqual({ limit: 4 })
  })

  it('listMessages: the cursor is scoped per ticket, so another ticket walks cold', async () => {
    const calls = fakePylon({ messages: 9 })
    const adapter = new GorgiasAircallAdapter()
    await adapter.listMessages(CREDS, '42', withPageSink({ page: 1, limit: 4 }))
    const rows = await adapter.listMessages(CREDS, '43', withPageSink({ page: 2, limit: 4 }))
    expect(rows.map((r) => r.id)).toEqual(['r5', 'r6', 'r7', 'r8'])
    expect(calls.map((c) => c.path)).toEqual([
      '/issues/42/messages',
      '/issues/43/messages',
      '/issues/43/messages',
    ])
    expect(calls[1]!.params).toEqual({ limit: 4 })
  })

  it('listTickets: page 1 re-anchors the default window instead of reusing a live one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
    const calls = fakePylon({ issues: 9 })
    const adapter = new GorgiasAircallAdapter()
    await adapter.listTickets(CREDS, withPageSink({ page: 1, limit: 4 }))
    // Well inside the anchor's idle TTL: a fresh walk must still see new issues.
    vi.setSystemTime(new Date('2026-09-01T12:00:10.000Z'))
    await adapter.listTickets(CREDS, withPageSink({ page: 1, limit: 4 }))
    expect(calls[0]!.params['end_time']).toBe('2026-09-01T12:00:00.000Z')
    expect(calls[1]!.params['end_time']).toBe('2026-09-01T12:00:10.000Z')
    expect(calls[1]!.params['cursor']).toBeUndefined()
  })

  it('listTickets: a limit above the documented 20000 is clamped', async () => {
    const calls = fakePylon({ issues: 3 })
    await new GorgiasAircallAdapter().listTickets(CREDS, withPageSink({ page: 1, limit: 50000 }))
    expect(calls[0]!.params['limit']).toBe(MAX_ISSUES)
  })

  it('declares the documented maximum', () => {
    expect(new GorgiasAircallAdapter().capabilities.maxPageSize).toBe(MAX)
  })

  it('API path: parseListQuery → listContacts → listPage reports the next page', async () => {
    fakePylon({ contacts: 2500 })
    const adapter = new GorgiasAircallAdapter()
    const params = parseListQuery({ limit: '5000', page: '2' }, adapter)
    const rows = await adapter.listContacts(CREDS, params)
    const env = listPage(rows, params, 'gorgias-aircall')
    // The router caps every list at its own 500, below Pylon's 999.
    const served = Math.min(MAX, 500)
    expect(env.meta.limit).toBe(served)
    expect(env.data.map((r) => r.id)).toEqual(
      Array.from({ length: served }, (_, i) => `r${served + i + 1}`),
    )
    expect(env.meta.hasMore).toBe(true)
  })
})
