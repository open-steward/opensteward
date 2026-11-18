/**
 * Totango list requests and paging, against a fake that honours only what
 * Totango documents.
 *
 * Search API (accounts and users),
 * https://support.totango.com/hc/en-us/articles/204174135-Search-API-accounts-and-users
 * (fetched as https://support.totango.com/api/v2/help_center/en-us/articles/204174135.json):
 *
 *   "For US services, please use https://api.totango.com"
 *   "There is a maximum of 10,000 total records that can be accessed through this API."
 *   "{US or EU api URL}/api/v1/search/accounts" / "{US or EU api URL}/api/v1/search/users"
 *   curl --data 'query={ ... }' --header 'app-token:YOUR-TOKEN-HERE'
 *   "count (optional, default: 1000) ... The max value for count is 1000."
 *   "offset (optional, default: 0): Record number (0 states "start at record 0")."
 *   "sort_by, sort_order (optional, default display_name and ASC)"
 *   accounts: {"response": {... "stats":{"total_hits":158}, "accounts":{"hits":[...]}}}
 *   users:    {"response":{"total_hits":2634}, ... "users":{"hits":[...]}}}  (malformed in the doc)
 *
 * Search API (events),
 * https://support.totango.com/hc/en-us/articles/360048132792-Search-API-events
 * (fetched as https://support.totango.com/api/v2/help_center/en-us/articles/360048132792.json):
 *
 *   "POST {US or EU api URL}/api/v2/events/search"
 *   "fields (mandatory): ... Note that this should be always empty (i.e., [])."
 *   "count (mandatory): ... The max. value for count is 1000"
 *   "offset (mandatory): Page number (0 is the 1st-page)."
 *   {"type":"event_property","name":"event_type","eq":"note"}
 *   {"response": {"events": {"hits": [...], "total": 5}}}
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readUpstreamPage, withPageSink, type QueryParams } from '@opensteward/shared'
import { TotangoAdapter } from '../../../../../../src/verticals/crm/adapters/totango/index'

const TOKEN = 'tok_test'
const CREDS = { accessToken: TOKEN }
const HOST = 'https://api.totango.com'
const MAX = 1000
const CAP = 10_000
const EVENT_TYPES = ['note', 'campaign_touch', 'alert', 'task']

interface Sent {
  path: string
  form: Record<string, string>
  query: Record<string, unknown>
}

interface FakeOptions {
  accounts?: number
  users?: number
  events?: { type: string }[]
  /** Put `users` beside `response`, the other reading of the malformed users sample. */
  usersBesideResponse?: boolean
  /** Leave the total out of every response. */
  noTotals?: boolean
}

function refuse(status: number, text: string): Response {
  return new Response(text, { status })
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function matchesEventTerm(term: Record<string, unknown>, type: string): boolean {
  if (term['type'] === 'event_property' && term['name'] === 'event_type') return term['eq'] === type
  if (term['type'] === 'or' && Array.isArray(term['or'])) {
    return (term['or'] as Record<string, unknown>[]).some((t) => matchesEventTerm(t, type))
  }
  throw new Error(`fake: undocumented term ${JSON.stringify(term)}`)
}

/**
 * A fake Totango that answers only the documented search endpoints on the
 * documented US host, reads only the documented `query` form field (and
 * `account_id` on events), and refuses values outside the documented ranges.
 */
function fakeTotango(opts: FakeOptions) {
  const pad = (i: number) => String(i).padStart(6, '0')
  const accounts = Array.from({ length: opts.accounts ?? 0 }, (_, i) => ({
    name: `acc-${pad(i + 1)}`,
    display_name: `Account ${pad(i + 1)}`,
    last_activity_time: 1421422240000,
    selected_fields: [],
  }))
  const users = Array.from({ length: opts.users ?? 0 }, (_, i) => ({
    name: `user-${pad(i + 1)}@example.test`,
    display_name: `User ${pad(i + 1)}`,
    first_activity_time: 1404296416000,
    last_activity_time: 1423058976000,
    selected_fields: [],
  }))
  const events = (opts.events ?? []).map((e, i) => ({
    id: `ev-${pad(i + 1)}`,
    timestamp: 1588493035000 + i,
    type: e.type,
    account: { id: 'ACCOUNT_ID' },
    is_new: null,
    note_content:
      e.type === 'note'
        ? {
            text: `body ${i + 1}`,
            totango_user: { user_name: 'someone@totango.com' },
            note_id: i + 1,
          }
        : undefined,
    properties: { subject: `subject ${i + 1}` },
  }))
  const sent: Sent[] = []

  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    if (url.origin !== HOST) return refuse(404, `unexpected host ${url.origin}`)
    if (init?.method !== 'POST') return refuse(405, `unexpected ${String(init?.method)}`)
    const headers = new Headers(init.headers)
    if (headers.get('app-token') !== TOKEN) {
      return refuse(401, '{"message":"missing authentication token"}')
    }
    const form = Object.fromEntries(new URLSearchParams(String(init.body ?? '')))
    const allowed = url.pathname === '/api/v2/events/search' ? ['query', 'account_id'] : ['query']
    for (const k of Object.keys(form)) {
      if (!allowed.includes(k)) return refuse(400, `undocumented form field ${k}`)
    }
    if (form['query'] === undefined) return refuse(400, 'query is required')
    const query = JSON.parse(form['query']) as Record<string, unknown>
    sent.push({ path: url.pathname, form, query })
    if (!Array.isArray(query['terms'])) return refuse(400, 'terms is mandatory')
    if (!Array.isArray(query['fields'])) return refuse(400, 'fields is mandatory')

    if (url.pathname === '/api/v1/search/accounts' || url.pathname === '/api/v1/search/users') {
      const count = query['count'] ?? 1000
      const offset = query['offset'] ?? 0
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > MAX) {
        return refuse(400, `count must be 1..${MAX}`)
      }
      if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
        return refuse(400, 'offset must be a record number >= 0')
      }
      if ((query['sort_by'] ?? 'display_name') !== 'display_name') return refuse(400, 'sort_by')
      if ((query['sort_order'] ?? 'ASC') !== 'ASC') return refuse(400, 'sort_order')
      const all = url.pathname.endsWith('/accounts') ? accounts : users
      const ordered = [...all].sort((a, b) => a.display_name.localeCompare(b.display_name))
      const hits = ordered.slice(0, CAP).slice(offset, offset + count)
      if (url.pathname.endsWith('/accounts')) {
        return json({
          response: {
            status: 'success',
            ...(opts.noTotals ? {} : { stats: { total_hits: all.length } }),
            accounts: { hits },
          },
        })
      }
      const total = opts.noTotals ? {} : { total_hits: all.length }
      return json(
        opts.usersBesideResponse
          ? { response: total, status: 'success', users: { hits } }
          : { response: { ...total, status: 'success', users: { hits } } },
      )
    }

    if (url.pathname === '/api/v2/events/search') {
      const count = query['count']
      const offset = query['offset']
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > MAX) {
        return refuse(400, `count is mandatory, 1..${MAX}`)
      }
      if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
        return refuse(400, 'offset is mandatory: a page number, 0 is the 1st page')
      }
      if ((query['fields'] as unknown[]).length !== 0) return refuse(400, 'fields must be []')
      const terms = query['terms'] as Record<string, unknown>[]
      const matching = events.filter((e) => terms.every((t) => matchesEventTerm(t, e.type)))
      const hits = matching.slice(offset * count, offset * count + count)
      return json({
        _type: 'status',
        response: { events: { hits, ...(opts.noTotals ? {} : { total: matching.length }) } },
        status: 'success',
      })
    }

    return refuse(404, `unexpected path ${url.pathname}`)
  })
  return { sent, spy }
}

type Row = { id: string }

const SEARCH_LISTS = [
  {
    name: 'listCompanies',
    path: '/api/v1/search/accounts',
    fake: (n: number, extra: FakeOptions = {}) => fakeTotango({ accounts: n, ...extra }),
    call: (a: TotangoAdapter, p: QueryParams): Promise<Row[]> => a.listCompanies(CREDS, p),
    idOf: (i: number) => `acc-${String(i).padStart(6, '0')}`,
  },
  {
    name: 'listContacts',
    path: '/api/v1/search/users',
    fake: (n: number, extra: FakeOptions = {}) => fakeTotango({ users: n, ...extra }),
    call: (a: TotangoAdapter, p: QueryParams): Promise<Row[]> => a.listContacts(CREDS, p),
    idOf: (i: number) => `user-${String(i).padStart(6, '0')}@example.test`,
  },
] as const

async function walk(
  call: (a: TotangoAdapter, p: QueryParams) => Promise<Row[]>,
  limit: number,
  pages: number,
) {
  const adapter = new TotangoAdapter()
  const out: { ids: string[]; hasMore: boolean | undefined; totalCount: number | undefined }[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    const rows = await call(adapter, params)
    const meta = readUpstreamPage(params)
    out.push({ ids: rows.map((r) => r.id), hasMore: meta?.hasMore, totalCount: meta?.totalCount })
  }
  return out
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('totango search lists (accounts, users)', () => {
  for (const m of SEARCH_LISTS) {
    describe(m.name, () => {
      it('POSTs the documented path on the US host with only the `query` form field', async () => {
        const { sent } = m.fake(10)
        await m.call(new TotangoAdapter(), withPageSink({ page: 3, limit: 4 }))
        expect(sent).toHaveLength(1)
        expect(sent[0]!.path).toBe(m.path)
        expect(Object.keys(sent[0]!.form)).toEqual(['query'])
        expect(sent[0]!.query).toEqual({
          terms: [],
          fields: [],
          count: 4,
          offset: 8,
          sort_by: 'display_name',
          sort_order: 'ASC',
        })
      })

      it('walks N = 2L+1 rows: every id once, hasMore exact', async () => {
        const L = 3
        m.fake(2 * L + 1)
        const pages = await walk(m.call, L, 3)
        expect(pages.map((p) => p.ids.length)).toEqual([3, 3, 1])
        expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
        expect(pages.every((p) => p.totalCount === 2 * L + 1)).toBe(true)
        const ids = pages.flatMap((p) => p.ids)
        expect(ids).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => m.idOf(i + 1)))
      })

      it('ends exactly on a full last page when the total is reported', async () => {
        m.fake(6)
        const pages = await walk(m.call, 3, 2)
        expect(pages.map((p) => p.hasMore)).toEqual([true, false])
      })

      it('without a total, follows the documented rule: a full page means more', async () => {
        m.fake(7, { noTotals: true })
        const pages = await walk(m.call, 3, 3)
        expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
        expect(pages.map((p) => p.totalCount)).toEqual([undefined, undefined, undefined])
        expect(pages.flatMap((p) => p.ids)).toHaveLength(7)
      })

      it('clamps a direct call past the documented max to 1000 and reports that size', async () => {
        const { sent } = m.fake(5)
        const params = withPageSink({ page: 2, limit: 5000 })
        await m.call(new TotangoAdapter(), params)
        expect(sent[0]!.query['count']).toBe(1000)
        expect(sent[0]!.query['offset']).toBe(1000)
        expect(readUpstreamPage(params)?.pageSize).toBe(1000)
      })

      it('refuses a page past the documented 10,000-record ceiling without sending it', async () => {
        const { sent } = m.fake(10)
        await expect(
          m.call(new TotangoAdapter(), withPageSink({ page: 11, limit: 1000 })),
        ).rejects.toMatchObject({ statusCode: 422, code: 'UPSTREAM_LIMIT' })
        expect(sent).toHaveLength(0)
      })

      it('serves the last page under the ceiling, then refuses the next', async () => {
        const { sent } = m.fake(CAP + 50)
        const adapter = new TotangoAdapter()
        const params = withPageSink({ page: 10, limit: 1000 })
        const rows = await m.call(adapter, params)
        expect(rows).toHaveLength(1000)
        expect(readUpstreamPage(params)?.hasMore).toBe(true)
        await expect(
          m.call(adapter, withPageSink({ page: 11, limit: 1000 })),
        ).rejects.toMatchObject({
          statusCode: 422,
        })
        expect(sent).toHaveLength(1)
      })

      it('refuses a short page cut by the ceiling instead of calling it the end', async () => {
        m.fake(CAP + 50, { noTotals: true })
        // limit 3: page 3334 starts at record 9999 and the fake stops at 10,000.
        await expect(
          m.call(new TotangoAdapter(), withPageSink({ page: 3334, limit: 3 })),
        ).rejects.toMatchObject({ statusCode: 422, code: 'UPSTREAM_LIMIT' })
      })

      it('sends the documented default count of 1000 when the caller gives no limit', async () => {
        const { sent } = m.fake(5)
        await m.call(new TotangoAdapter(), withPageSink({ page: 1 }))
        expect(sent[0]!.query['count']).toBe(1000)
        expect(sent[0]!.query['offset']).toBe(0)
      })

      it('throws on a response without the documented hits array instead of returning []', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ response: { status: 'success' } }))
        await expect(
          m.call(new TotangoAdapter(), withPageSink({ page: 1, limit: 5 })),
        ).rejects.toMatchObject({ statusCode: 502 })
      })
    })
  }

  it('listContacts reads users beside `response`, the other reading of the malformed sample', async () => {
    fakeTotango({ users: 7, usersBesideResponse: true })
    const pages = await walk((a, p) => a.listContacts(CREDS, p), 3, 3)
    expect(pages.flatMap((p) => p.ids)).toHaveLength(7)
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
  })
})

describe('totango event lists (notes, activities)', () => {
  const mixed = [
    { type: 'note' },
    { type: 'task' },
    { type: 'note' },
    { type: 'alert' },
    { type: 'note' },
    { type: 'campaign_touch' },
    { type: 'note' },
    { type: 'note' },
    { type: 'note' },
    { type: 'task' },
    { type: 'note' },
  ]

  it('listNotes POSTs /api/v2/events/search for event_type note, offset as a 0-based page', async () => {
    const { sent } = fakeTotango({ events: mixed })
    await new TotangoAdapter().listNotes(CREDS, withPageSink({ page: 2, limit: 3 }))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.path).toBe('/api/v2/events/search')
    expect(Object.keys(sent[0]!.form)).toEqual(['query'])
    expect(sent[0]!.query).toEqual({
      terms: [{ type: 'event_property', name: 'event_type', eq: 'note' }],
      fields: [],
      offset: 1,
      count: 3,
    })
  })

  it('listActivities asks for every documented event_type', async () => {
    const { sent } = fakeTotango({ events: mixed })
    await new TotangoAdapter().listActivities(CREDS, withPageSink({ page: 1, limit: 3 }))
    expect(sent[0]!.query['terms']).toEqual([
      {
        type: 'or',
        or: EVENT_TYPES.map((eq) => ({ type: 'event_property', name: 'event_type', eq })),
      },
    ])
    expect(sent[0]!.query['offset']).toBe(0)
  })

  it('listNotes walks N = 2L+1 notes: every id once, hasMore exact', async () => {
    const L = 3
    fakeTotango({ events: mixed }) // 7 notes among 11 events
    const pages = await walk((a, p) => a.listNotes(CREDS, p), L, 3)
    expect(pages.map((p) => p.ids.length)).toEqual([3, 3, 1])
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    expect(pages.every((p) => p.totalCount === 7)).toBe(true)
    const ids = pages.flatMap((p) => p.ids)
    expect(ids).toEqual([
      'ev-000001',
      'ev-000003',
      'ev-000005',
      'ev-000007',
      'ev-000008',
      'ev-000009',
      'ev-000011',
    ])
  })

  it('listActivities walks N = 2L+1 events of every type: every id once, hasMore exact', async () => {
    const L = 3
    fakeTotango({ events: mixed.slice(0, 2 * L + 1) })
    const pages = await walk((a, p) => a.listActivities(CREDS, p), L, 3)
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    expect(pages.flatMap((p) => p.ids)).toEqual(
      Array.from({ length: 2 * L + 1 }, (_, i) => `ev-${String(i + 1).padStart(6, '0')}`),
    )
  })

  it('ends exactly on a full last page when the total is reported', async () => {
    // 6 notes, limit 3: page 2 is full, and total 6 says it is the last.
    fakeTotango({ events: mixed.slice(0, 9) })
    const pages = await walk((a, p) => a.listNotes(CREDS, p), 3, 2)
    expect(pages.map((p) => p.ids.length)).toEqual([3, 3])
    expect(pages.map((p) => p.hasMore)).toEqual([true, false])
    expect(pages.map((p) => p.totalCount)).toEqual([6, 6])
  })

  it('sends count 1000 when the caller gives no limit', async () => {
    const { sent } = fakeTotango({ events: mixed })
    await new TotangoAdapter().listNotes(CREDS, withPageSink({ page: 1 }))
    expect(sent[0]!.query['count']).toBe(1000)
    expect(sent[0]!.query['offset']).toBe(0)
  })

  it('without a total, a full page means more and a short page ends the walk', async () => {
    fakeTotango({ events: mixed.slice(0, 7), noTotals: true })
    const pages = await walk((a, p) => a.listActivities(CREDS, p), 3, 3)
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
  })

  it('clamps a direct call past the documented max to 1000 and reports that size', async () => {
    const { sent } = fakeTotango({ events: mixed })
    const params = withPageSink({ page: 1, limit: 5000 })
    await new TotangoAdapter().listActivities(CREDS, params)
    expect(sent[0]!.query['count']).toBe(1000)
    expect(readUpstreamPage(params)?.pageSize).toBe(1000)
  })

  it('throws on a response without response.events.hits instead of returning []', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ status: 'success' }))
    await expect(
      new TotangoAdapter().listNotes(CREDS, withPageSink({ page: 1, limit: 5 })),
    ).rejects.toMatchObject({ statusCode: 502 })
  })
})

describe('totango get by id', () => {
  it.each(['getCompany', 'getContact'] as const)(
    '%s refuses with 501 NOT_SUPPORTED and sends nothing',
    async (method) => {
      const spy = vi.spyOn(globalThis, 'fetch')
      await expect(new TotangoAdapter()[method](CREDS, '19934')).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
      })
      expect(spy).not.toHaveBeenCalled()
    },
  )
})
