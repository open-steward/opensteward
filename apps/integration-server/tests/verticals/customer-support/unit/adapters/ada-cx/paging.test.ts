/**
 * Ada CX list paging and request shape.
 *
 * Every parameter the fakes honour is quoted from docs.ada.cx:
 *
 * GET /api/v2/export/conversations
 * (https://docs.ada.cx/data-export-conversation-object/get-conversations):
 *   - `created_since` / `updated_since`: "Must be an ISO 8601 UTC timestamp
 *     ending with 'Z' ... required for valid API requests", and
 *     "`updated_since` and `created_since` are mutually exclusive";
 *   - `created_to` / `updated_to`: "Return records that were created [updated]
 *     earlier than this date";
 *   - `page_size`: "The maximum and default is 10000, the minimum is 100";
 *   - response `data` and `meta.next_page_uri`: "Link to the next page of
 *     results matching the query".
 * https://docs.ada.cx/reference/data-export/overview: "A query’s end date
 * cannot be more than 60 days after its start date", and "access to data
 * from the past 12 months".
 *
 * GET /api/v2/conversations/{conversation_id}/messages/
 * (https://docs.ada.cx/reference/conversations/fetch-conversation-messages-by-id):
 *   `cursor` ("Use the value from `meta.next_page_url`"), `limit` ("default
 *   100, max 100"), response `data` and `meta.next_page_url`.
 *
 * GET /api/v2/end-users/ (https://docs.ada.cx/reference/end-users/get-end-users):
 *   `cursor`, `limit`, response `data` and `meta.next_page_url`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { AdaCxAdapter } from '../../../../../../src/verticals/customer-support/adapters/ada-cx/index'

const HOST = 'https://acme.ada.support'
const creds: Credentials = { accessToken: 'ada-key', extra: { botHandle: 'acme' } }
const NOW = new Date('2026-09-25T10:00:00Z')
const DAY = 86_400_000

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let handler: (path: string, params: Record<string, unknown>) => unknown
let createdWith: Record<string, unknown>[] = []

beforeEach(() => {
  calls = []
  createdWith = []
  _resetCursorPager()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.spyOn(axios, 'create').mockImplementation((cfg) => {
    createdWith.push(cfg as Record<string, unknown>)
    return {
      get: async (path: string, cfg?: { params?: Record<string, unknown> }) => {
        const params = { ...(cfg?.params ?? {}) }
        calls.push({ path, params })
        return { data: handler(path, params) }
      },
    } as unknown as ReturnType<typeof axios.create>
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const adapter = new AdaCxAdapter()

class BadRequest extends Error {}

// ── Export conversations fake ────────────────────────────────────────────────

const Z_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/

interface Row {
  _id: string
  date_created: string
  date_updated: string
}

/**
 * GET /api/v2/export/conversations over `rows`, honouring only the documented
 * parameters. It serves rows strictly between since and to, oldest first,
 * `page_size` at a time, and links to the next page with `next_page_uri`,
 * whose query encoding is this fake's own business. With `relativeLinks` the
 * link is host-relative, the form Ada's Getting Started samples resolve
 * ("fetch(`https://<YOUR-BOT-HANDLE>.ada.support/${endpoint}`").
 */
function exportFake(rows: Row[], relativeLinks = false) {
  const lookback = Date.UTC(2025, 8, 25)
  return (path: string, params: Record<string, unknown>) => {
    let q: Record<string, string>
    if (path.startsWith('https://')) {
      const url = new URL(path)
      if (url.origin !== HOST) throw new Error(`request left the host: ${url.origin}`)
      if (url.pathname !== '/api/v2/export/conversations') throw new Error(url.pathname)
      if (Object.keys(params).length) throw new BadRequest('params sent with next_page_uri')
      q = Object.fromEntries(url.searchParams)
    } else {
      if (path !== '/api/v2/export/conversations') throw new Error(`unexpected path ${path}`)
      for (const k of Object.keys(params))
        if (
          !['created_since', 'created_to', 'updated_since', 'updated_to', 'page_size'].includes(k)
        )
          throw new BadRequest(`undocumented parameter ${k}`)
      q = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    }
    const created = q['created_since'] !== undefined
    const updated = q['updated_since'] !== undefined
    if (created === updated) throw new BadRequest('exactly one of created_since/updated_since')
    const since = q[created ? 'created_since' : 'updated_since']!
    const to = q[created ? 'created_to' : 'updated_to']
    if (to === undefined) throw new BadRequest('the adapter must bound every window')
    if (!Z_TIMESTAMP.test(since) || !Z_TIMESTAMP.test(to)) throw new BadRequest('not ...Z')
    const lo = Date.parse(since)
    const hi = Date.parse(to)
    if (hi - lo > 60 * DAY) throw new BadRequest('window over 60 days')
    if (lo < lookback) throw new BadRequest('older than 12 months')
    const size = Number(q['page_size'] ?? 10_000)
    if (size < 100 || size > 10_000) throw new BadRequest(`page_size ${size}`)
    const field = created ? 'date_created' : 'date_updated'
    const hits = rows
      .filter((r) => {
        const t = Date.parse(`${r[field]}Z`)
        return t > lo && t < hi
      })
      .sort((a, b) => a[field].localeCompare(b[field]))
    const offset = Number(q['offset'] ?? 0)
    const page = hits.slice(offset, offset + size)
    const more = offset + size < hits.length
    const nextQuery = new URLSearchParams({
      [created ? 'created_since' : 'updated_since']: since,
      [created ? 'created_to' : 'updated_to']: to,
      page_size: String(size),
      offset: String(offset + size),
    })
    return {
      data: page.map((r) => ({ ...r, platform: 'chat', end_user_id: null })),
      meta: {
        next_page_uri: more
          ? `${relativeLinks ? '' : `${HOST}/`}api/v2/export/conversations?${nextQuery}`
          : null,
      },
    }
  }
}

/** `n` rows created on `daysAgo` days before NOW (Ada's zone-less UTC format). */
function rowsOn(prefix: string, daysAgo: number, n: number): Row[] {
  return Array.from({ length: n }, (_, i) => {
    const t = new Date(NOW.getTime() - daysAgo * DAY + i * 1000)
      .toISOString()
      .replace(/\.\d{3}Z$/, '')
    return { _id: `${prefix}${String(i).padStart(4, '0')}`, date_created: t, date_updated: t }
  })
}

async function walk(run: (p: QueryParams) => Promise<{ id: string }[]>, limit: number, pages = 3) {
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    ids.push(...rows.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids, hasMore }
}

describe('ada-cx listTickets (Data Export, date windows)', () => {
  const run = (p: QueryParams) => adapter.listTickets(creds, p)

  it('walks uneven windows: every id once across pages of 2L+1 rows, hasMore exact', async () => {
    const L = 5
    // 3 rows in the newest window, none in the next, 8 four months back.
    const rows = [...rowsOn('a', 2, 3), ...rowsOn('b', 130, 8)]
    handler = exportFake(rows)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toHaveLength(2 * L + 1)
    expect(new Set(ids)).toEqual(new Set(rows.map((r) => r._id)))
    // Newest window first.
    expect(ids.slice(0, 3)).toEqual(['a0000', 'a0001', 'a0002'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('follows next_page_uri inside a window, as given', async () => {
    const L = 100
    const rows = [...rowsOn('a', 1, 150), ...rowsOn('c', 200, 51)]
    handler = exportFake(rows)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toHaveLength(2 * L + 1)
    expect(new Set(ids).size).toBe(2 * L + 1)
    expect(hasMore).toEqual([true, true, false])
    const links = calls.filter((c) => c.path.startsWith(HOST))
    expect(links.length).toBeGreaterThan(0)
    for (const c of links) expect(c.params).toEqual({})
  })

  it('follows a host-relative next_page_uri on the connection host', async () => {
    const L = 100
    const rows = [...rowsOn('a', 1, 150), ...rowsOn('c', 200, 51)]
    handler = exportFake(rows, true)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toHaveLength(2 * L + 1)
    expect(new Set(ids).size).toBe(2 * L + 1)
    expect(hasMore).toEqual([true, true, false])
    const links = calls.filter((c) => c.path.startsWith('https://'))
    expect(links.length).toBeGreaterThan(0)
    for (const c of links) expect(new URL(c.path).origin).toBe(HOST)
  })

  it('an updatedAfter walk never resumes from an unfiltered walk’s positions', async () => {
    const rows = rowsOn('a', 1, 12)
    handler = exportFake(rows)
    await run(withPageSink({ page: 1, limit: 5 }))
    calls = []
    const out = await run(
      withPageSink({ page: 2, limit: 5, updatedAfter: new Date('2026-09-01T00:00:00Z') }),
    )
    expect(out.map((t) => t.id)).toEqual(['a0005', 'a0006', 'a0007', 'a0008', 'a0009'])
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) {
      const q = c.path.startsWith('https://')
        ? Object.fromEntries(new URL(c.path).searchParams)
        : c.params
      expect(q).toHaveProperty('updated_since')
      expect(q).not.toHaveProperty('created_since')
    }
  })

  it('a walk at a new page_size never resumes from links minted at another', async () => {
    handler = exportFake(rowsOn('a', 1, 450))
    await run(withPageSink({ page: 2, limit: 100 }))
    calls = []
    const out = await run(withPageSink({ page: 2, limit: 200 }))
    expect(out).toHaveLength(200)
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) {
      const q = c.path.startsWith('https://')
        ? Object.fromEntries(new URL(c.path).searchParams)
        : c.params
      expect(String(q['page_size'])).toBe('200')
    }
  })

  it('sends created_since/created_to windows of at most 60 days, newest first, back to the 12-month lookback', async () => {
    handler = exportFake([])
    const out = await run(withPageSink({ page: 1, limit: 10 }))
    expect(out).toEqual([])
    expect(calls[0]).toEqual({
      path: '/api/v2/export/conversations',
      params: {
        created_since: '2026-07-28T00:00:00Z',
        created_to: '2026-09-26T00:00:00Z',
        page_size: 100,
      },
    })
    expect(calls).toHaveLength(7)
    for (let i = 1; i < calls.length; i++)
      expect(calls[i]!.params['created_to']).toBe(calls[i - 1]!.params['created_since'])
    expect(calls[calls.length - 1]!.params['created_since']).toBe('2025-09-26T00:00:00Z')
  })

  it('with updatedAfter, windows go in updated_since/updated_to from that instant', async () => {
    const rows = rowsOn('u', 3, 4)
    handler = exportFake(rows)
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: new Date('2026-09-01T12:00:00Z'),
    })
    const out = await run(params)
    expect(out.map((t) => t.id)).toEqual(['u0000', 'u0001', 'u0002', 'u0003'])
    expect(calls).toEqual([
      {
        path: '/api/v2/export/conversations',
        params: {
          updated_since: '2026-09-01T12:00:00Z',
          updated_to: '2026-09-26T00:00:00Z',
          page_size: 100,
        },
      },
    ])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('clamps an updatedAfter older than the 12-month lookback to it', async () => {
    handler = exportFake([])
    await run(withPageSink({ page: 1, limit: 10, updatedAfter: new Date('2020-01-01T00:00:00Z') }))
    expect(calls[calls.length - 1]!.params['updated_since']).toBe('2025-09-26T00:00:00Z')
  })

  it('page_size follows the caller within the documented 100..10000', async () => {
    handler = exportFake([])
    await run(withPageSink({ page: 1, limit: 2500 }))
    expect(calls[0]!.params['page_size']).toBe(2500)
    _resetCursorPager()
    calls = []
    await run(withPageSink({ page: 1, limit: 50_000 }))
    expect(calls[0]!.params['page_size']).toBe(10_000)
  })

  it('refuses to follow a next_page_uri to another host', async () => {
    handler = (path) => {
      if (path.startsWith('https://')) throw new Error('followed a foreign link')
      return { data: rowsOn('a', 1, 1), meta: { next_page_uri: 'https://evil.example/steal' } }
    }
    await expect(run(withPageSink({ page: 1, limit: 1 }))).rejects.toThrow(/leaves/)
    expect(calls.every((c) => !c.path.startsWith('https://'))).toBe(true)
  })

  it('reads the documented `data` envelope', async () => {
    handler = () => ({ items: rowsOn('x', 1, 2), data: rowsOn('d', 1, 1), meta: {} })
    const out = await run(withPageSink({ page: 1, limit: 10 }))
    expect(out.map((t) => t.id)).toContain('d0000')
    expect(out.map((t) => t.id)).not.toContain('x0000')
  })

  it('uses the documented host and bearer auth', async () => {
    handler = exportFake([])
    await run(withPageSink({ page: 1, limit: 10 }))
    expect(createdWith[0]).toMatchObject({
      baseURL: HOST,
      headers: { Authorization: 'Bearer ada-key' },
    })
  })
})

// ── Cursor endpoints (messages, end users) ─────────────────────────────────

/** A `cursor` + `limit` endpoint whose next_page_url carries the next cursor. */
function cursorFake(
  expectedPath: string,
  ids: string[],
  maxLimit: number | undefined,
  row: (id: string) => unknown,
) {
  return (path: string, params: Record<string, unknown>) => {
    if (path !== expectedPath) throw new Error(`unexpected path ${path}`)
    for (const k of Object.keys(params))
      if (!['cursor', 'limit'].includes(k)) throw new BadRequest(`undocumented parameter ${k}`)
    const limit = params['limit'] === undefined ? 100 : Number(params['limit'])
    if (maxLimit !== undefined && limit > maxLimit) throw new BadRequest(`limit ${limit}`)
    const start = params['cursor'] === undefined ? 0 : ids.indexOf(String(params['cursor']))
    if (start < 0) throw new BadRequest('bad cursor')
    const page = ids.slice(start, start + limit)
    const next = ids[start + limit]
    return {
      data: page.map(row),
      meta: { next_page_url: next ? `${HOST}/api/v2/api-name?cursor=${next}` : null },
    }
  }
}

const ids = (p: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${p}${String(i).padStart(4, '0')}`)

describe('ada-cx listMessages (Conversations API messages)', () => {
  const path = '/api/v2/conversations/conv_1/messages/'
  const row = (id: string) => ({
    type: 'message_logs',
    message_id: id,
    created_at: '2025-10-28T15:34:49+00:00',
    author: { id: 'eu_1', role: 'end_user' },
    content: { type: 'text', body: `body ${id}` },
  })
  const run = (p: QueryParams) => adapter.listMessages(creds, 'conv_1', p)

  it('walks 2L+1 messages: every id once, hasMore exact', async () => {
    const L = 5
    handler = cursorFake(path, ids('m', 2 * L + 1), 100, row)
    const { ids: got, hasMore } = await walk(run, L)
    expect(got).toEqual(ids('m', 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.params)).toEqual([
      { limit: 5 },
      { limit: 5, cursor: 'm0005' },
      { limit: 5, cursor: 'm0010' },
    ])
  })

  it('clamps a limit above the documented max of 100 and reports the size sent', async () => {
    handler = cursorFake(path, ids('m', 150), 100, row)
    const params = withPageSink({ page: 1, limit: 500 })
    const out = await run(params)
    expect(calls[0]!.params['limit']).toBe(100)
    expect(out).toHaveLength(100)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: 100 })
  })

  it('throws when next_page_url carries no cursor, instead of ending the list', async () => {
    handler = () => ({ data: [row('m1')], meta: { next_page_url: `${HOST}/api/v2/x?page=2` } })
    await expect(run(withPageSink({ page: 1, limit: 1 }))).rejects.toThrow(/cursor/)
  })
})

describe('ada-cx listContacts (End Users API)', () => {
  const path = '/api/v2/end-users/'
  const row = (id: string) => ({ end_user_id: id, profile: { display_name: `User ${id}` } })
  const run = (p: QueryParams) => adapter.listContacts(creds, p)

  it('walks 2L+1 end users: every id once, hasMore exact', async () => {
    const L = 4
    handler = cursorFake(path, ids('e', 2 * L + 1), undefined, row)
    const { ids: got, hasMore } = await walk(run, L)
    expect(got).toEqual(ids('e', 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.params)).toEqual([
      { limit: 4 },
      { limit: 4, cursor: 'e0004' },
      { limit: 4, cursor: 'e0008' },
    ])
  })

  it('reads `data`, not the old `end_users` key', async () => {
    handler = () => ({ end_users: [row('old')], data: [row('new')], meta: {} })
    const out = await run(withPageSink({ page: 1, limit: 10 }))
    expect(out.map((c) => c.id)).toEqual(['new'])
  })
})

describe('ada-cx get methods', () => {
  it('getTicket reads GET /api/v2/conversations/{id}/', async () => {
    handler = () => ({
      id: 'conv_9',
      end_user_id: 'eu_1',
      status: 'ended',
      created_at: '2020-09-20T00:00:00+00:00',
    })
    const t = await adapter.getTicket(creds, 'conv_9')
    expect(calls).toEqual([{ path: '/api/v2/conversations/conv_9/', params: {} }])
    expect(t).toMatchObject({ id: 'conv_9', status: 'closed' })
  })

  it('URI-encodes ids in the path', async () => {
    handler = (path) =>
      path.startsWith('/api/v2/end-users/')
        ? { end_user_id: 'a/b c', profile: {} }
        : path.endsWith('/messages/')
          ? { data: [], meta: {} }
          : { id: 'a/b c', status: 'active', created_at: '2020-09-20T00:00:00+00:00' }
    await adapter.getTicket(creds, 'a/b c')
    await adapter.getContact(creds, 'a/b c')
    await adapter.listMessages(creds, 'a/b c', withPageSink({ page: 1, limit: 5 }))
    expect(calls.map((c) => c.path)).toEqual([
      '/api/v2/conversations/a%2Fb%20c/',
      '/api/v2/end-users/a%2Fb%20c',
      '/api/v2/conversations/a%2Fb%20c/messages/',
    ])
  })

  it('getContact reads GET /api/v2/end-users/{end_user_id}', async () => {
    handler = () => row1
    const row1 = { end_user_id: 'eu_1', profile: { display_name: 'Ada Lovelace' } }
    const c = await adapter.getContact(creds, 'eu_1')
    expect(calls).toEqual([{ path: '/api/v2/end-users/eu_1', params: {} }])
    expect(c.name).toBe('Ada Lovelace')
  })
})
