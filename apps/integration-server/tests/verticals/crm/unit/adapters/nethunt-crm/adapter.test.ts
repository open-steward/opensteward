/**
 * NetHunt CRM against a fake of the Public REST API (v2), built from
 * https://nethunt.com/api/openapi.json (fetched 2026-09-25). The fake honours
 * ONLY what the document names, and answers anything else with 400/404:
 *
 *   GET  /api/v2/folders                                  (no parameters)
 *   GET  /api/v2/folders/{folderId}
 *   POST /api/v2/folders/{folderId}/records/filter        query: fieldKeys, limit, timeZone
 *                                                         body:  filter, sort, cursor
 *        "limit": {"minimum":1,"maximum":1000,"default":100}; "`total` is returned
 *        only on the first page (request without `cursor`)"; "`nextCursor` ...
 *        Absent on the last page."
 *   GET  /api/v2/folders/{folderId}/records/{recordId}    query: fieldKeys
 *   GET  /api/v2/folders/{folderId}/records/{recordId}/timeline
 *        query: fieldKeys, from, to, types, cursor, limit, includeEmailStats
 *
 * Auth: "securitySchemes":{"BearerAuth":{"scheme":"bearer","bearerFormat":"nh_live_*"}}.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { NetHuntCrmAdapter } from '../../../../../../src/verticals/crm/adapters/nethunt-crm/index'
import type {
  NetHuntCommentEvent,
  NetHuntField,
  NetHuntFolder,
  NetHuntFolderRole,
  NetHuntRecord,
} from '../../../../../../src/verticals/crm/adapters/nethunt-crm/types'
import { ContactSchema } from '../../../../../../src/verticals/crm/schema/contact'
import { CompanySchema } from '../../../../../../src/verticals/crm/schema/company'
import { DealSchema } from '../../../../../../src/verticals/crm/schema/deal'
import { ActivitySchema } from '../../../../../../src/verticals/crm/schema/activity'
import { NoteSchema } from '../../../../../../src/verticals/crm/schema/note'
import { documentedComment, documentedFolder, documentedRecord } from './fixtures'

const TOKEN = 'nh_live_test'
const CREDS = { accessToken: TOKEN }
const HOST = 'nethunt.com'
const MAX = 1000

interface FakeFolder {
  folder: NetHuntFolder
  records: NetHuntRecord[]
  /** recordId → comment events, newest first. */
  comments?: Record<string, NetHuntCommentEvent[]>
}

interface Sent {
  method: string
  url: URL
  body?: Record<string, unknown>
}

const FILTER_QUERY = new Set(['fieldKeys', 'limit', 'timeZone'])
const FILTER_BODY = new Set(['filter', 'sort', 'cursor'])
const TIMELINE_QUERY = new Set([
  'fieldKeys',
  'from',
  'to',
  'types',
  'cursor',
  'limit',
  'includeEmailStats',
])

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function badRequest(message: string): Response {
  return json({ error: 'INVALID_REQUEST', message, traceId: 't' }, 400)
}

function readLimit(url: URL): number | Response {
  const raw = url.searchParams.get('limit')
  const limit = raw === null ? 100 : Number(raw)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX)
    return badRequest('limit must be 1..1000')
  return limit
}

/**
 * Cursors are opaque upstream; the fake binds each to the workspace (token)
 * that issued it, so a cursor replayed against another workspace is a 400.
 */
const enc = (n: number, token: string = TOKEN) =>
  Buffer.from(`${token}|pos:${n}`).toString('base64url')
function dec(cursor: string, token: string): number | undefined {
  const text = Buffer.from(cursor, 'base64url').toString()
  const prefix = `${token}|pos:`
  return text.startsWith(prefix) ? Number(text.slice(prefix.length)) : undefined
}

interface FakeOptions {
  /** Further workspaces, keyed by the API key that reaches them. */
  byToken?: Record<string, FakeFolder[]>
  /**
   * The other documented records/filter ending: "a page count divisible by
   * `limit` may end with one final empty page — that is a normal end". When
   * set, a full page that reaches the last record still carries nextCursor.
   */
  trailingEmptyPage?: boolean
  /** Replace a route's body with an undocumented shape (502 checks). */
  malformed?: 'folders' | 'filter'
}

function fakeNetHunt(folders: FakeFolder[], opts: FakeOptions = {}) {
  const workspaces: Record<string, FakeFolder[]> = { [TOKEN]: folders, ...opts.byToken }
  const sent: Sent[] = []
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    sent.push({ method, url, body })
    if (url.host !== HOST) return new Response('wrong host', { status: 404 })
    const auth = new Headers(init?.headers).get('Authorization') ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    const folders = workspaces[token]
    if (!folders) {
      return json(
        { error: 'UNAUTHORIZED', message: 'Missing or invalid bearer token', traceId: 't' },
        401,
      )
    }
    const parts = url.pathname.split('/').filter(Boolean) // api v2 folders ...
    if (parts[0] !== 'api' || parts[1] !== 'v2' || parts[2] !== 'folders') {
      return new Response('not found', { status: 404 })
    }
    if (parts.length === 3 && method === 'GET') {
      if ([...url.searchParams.keys()].length > 0) return badRequest('no parameters')
      if (opts.malformed === 'folders') return json({ folders: [] })
      // "`fields[]` is not included in list responses"
      return json(folders.map((f) => ({ ...f.folder, fields: undefined })))
    }
    const f = folders.find((x) => x.folder.id === parts[3])
    if (!f) return json({ error: 'FOLDER_NOT_FOUND', message: 'no folder', traceId: 't' }, 404)
    if (parts.length === 4 && method === 'GET') return json(f.folder)

    if (
      parts.length === 6 &&
      parts[4] === 'records' &&
      parts[5] === 'filter' &&
      method === 'POST'
    ) {
      for (const k of url.searchParams.keys())
        if (!FILTER_QUERY.has(k)) return badRequest(`param ${k}`)
      for (const k of Object.keys(body ?? {}))
        if (!FILTER_BODY.has(k)) return badRequest(`body ${k}`)
      const limit = readLimit(url)
      if (limit instanceof Response) return limit
      if (opts.malformed === 'filter') return json({ data: [] })
      const cursor = body?.['cursor'] as string | undefined
      const offset = cursor === undefined ? 0 : dec(cursor, token)
      if (offset === undefined) return badRequest('invalid cursor')
      const end = offset + limit
      const more =
        end < f.records.length ||
        (opts.trailingEmptyPage === true && end === f.records.length && f.records.length > 0)
      return json({
        records: f.records.slice(offset, end),
        sort: [{ created: 1 }],
        ...(cursor === undefined ? { total: f.records.length } : {}),
        ...(more ? { nextCursor: enc(end, token) } : {}),
      })
    }
    if (parts.length === 6 && parts[4] === 'records' && method === 'GET') {
      for (const k of url.searchParams.keys())
        if (k !== 'fieldKeys') return badRequest(`param ${k}`)
      const r = f.records.find((x) => x.id === parts[5])
      return r
        ? json(r)
        : json({ error: 'RECORD_NOT_FOUND', message: 'no record', traceId: 't' }, 404)
    }
    if (
      parts.length === 7 &&
      parts[4] === 'records' &&
      parts[6] === 'timeline' &&
      method === 'GET'
    ) {
      for (const k of url.searchParams.keys())
        if (!TIMELINE_QUERY.has(k)) return badRequest(`param ${k}`)
      if (url.searchParams.get('types') !== 'comment')
        return badRequest('test fake serves types=comment only')
      const limit = readLimit(url)
      if (limit instanceof Response) return limit
      const events = f.comments?.[parts[5]!] ?? []
      const cursor = url.searchParams.get('cursor')
      const offset = cursor === null ? 0 : dec(cursor, token)
      if (offset === undefined) return badRequest('invalid cursor')
      const end = offset + limit
      return json({
        events: events.slice(offset, end),
        ...(end < events.length ? { nextCursor: enc(end, token) } : {}),
      })
    }
    return new Response(`unexpected ${method} ${url.pathname}`, { status: 404 })
  })
  return { sent, spy }
}

function records(prefix: string, n: number): NetHuntRecord[] {
  return Array.from({ length: n }, (_, i) =>
    documentedRecord({ id: `${prefix}-${i + 1}`, fields: { name: `${prefix} ${i + 1}` } }),
  )
}

function folder(id: string, role?: NetHuntFolderRole, fields?: NetHuntField[]): NetHuntFolder {
  return documentedFolder({
    id,
    name: `Folder ${id}`,
    ...(role ? { role } : {}),
    ...(fields ? { fields } : {}),
  })
}

const TASK_FIELDS: NetHuntField[] = [
  { id: '12', name: 'Completed', type: 'checkbox', role: 'completed' },
  { id: '13', name: 'Due', type: 'dateTime', role: 'dueDate' },
]

function workspace(n: number): FakeFolder[] {
  return [
    { folder: folder('f-other'), records: records('other', 2) },
    { folder: folder('f-contact', 'contact'), records: records('contact', n) },
    { folder: folder('f-company', 'company'), records: records('company', n) },
    { folder: folder('f-deal', 'deal'), records: records('deal', n) },
    {
      folder: folder('f-task', 'task', TASK_FIELDS),
      records: records('task', n).map((r, i) => ({
        ...r,
        fields: { ...r.fields, '12': i % 2 === 0 },
      })),
    },
  ]
}

const adapter = new NetHuntCrmAdapter()

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

type RecordMethod = 'listContacts' | 'listCompanies' | 'listDeals' | 'listActivities'
const RECORD_CASES: {
  method: RecordMethod
  folderId: string
  prefix: string
  schema: { parse(v: unknown): unknown }
}[] = [
  { method: 'listContacts', folderId: 'f-contact', prefix: 'contact', schema: ContactSchema },
  { method: 'listCompanies', folderId: 'f-company', prefix: 'company', schema: CompanySchema },
  { method: 'listDeals', folderId: 'f-deal', prefix: 'deal', schema: DealSchema },
  { method: 'listActivities', folderId: 'f-task', prefix: 'task', schema: ActivitySchema },
]

describe.each(RECORD_CASES)(
  'nethunt-crm $method pages records/filter',
  ({ method, folderId, prefix, schema }) => {
    it('walks N = 2L+1 records once each, with hasMore exact and total reported', async () => {
      const L = 3
      const N = 2 * L + 1
      const { sent } = fakeNetHunt(workspace(N))
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (let page = 1; page <= 3; page++) {
        const params = withPageSink({ page, limit: L } as QueryParams)
        const rows = await adapter[method](CREDS, params)
        for (const r of rows) schema.parse(r)
        seen.push(...rows.map((r) => r.id))
        const meta = readUpstreamPage(params)
        hasMore.push(meta?.hasMore)
        if (page === 1) expect(meta?.totalCount).toBe(N)
        else expect(meta?.totalCount).toBeUndefined()
      }
      expect(seen).toEqual(Array.from({ length: N }, (_, i) => `${prefix}-${i + 1}`))
      expect(hasMore).toEqual([true, true, false])

      const filters = sent.filter((s) => s.url.pathname.endsWith('/records/filter'))
      expect(filters.map((s) => s.url.pathname)).toEqual(
        Array(3).fill(`/api/v2/folders/${folderId}/records/filter`),
      )
      expect(filters.map((s) => s.url.searchParams.get('limit'))).toEqual(['3', '3', '3'])
      expect(filters[0]!.body).toEqual({})
      expect(filters[1]!.body).toEqual({ cursor: enc(3) })
      expect(filters[2]!.body).toEqual({ cursor: enc(6) })
    })

    it('takes hasMore from nextCursor, not from a full page, when N is a multiple of L (last page without nextCursor)', async () => {
      fakeNetHunt(workspace(6))
      const hasMore: (boolean | undefined)[] = []
      for (let page = 1; page <= 2; page++) {
        const params = withPageSink({ page, limit: 3 } as QueryParams)
        expect(await adapter[method](CREDS, params)).toHaveLength(3)
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(hasMore).toEqual([true, false])
    })

    it('treats a trailing empty page as the documented normal end', async () => {
      // "a page count divisible by `limit` may end with one final empty page"
      fakeNetHunt(workspace(6), { trailingEmptyPage: true })
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (let page = 1; page <= 3; page++) {
        const params = withPageSink({ page, limit: 3 } as QueryParams)
        const rows = await adapter[method](CREDS, params)
        seen.push(...rows.map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(Array.from({ length: 6 }, (_, i) => `${prefix}-${i + 1}`))
      expect(hasMore).toEqual([true, true, false])
    })

    it('keeps page cursors per connection, not shared across workspaces', async () => {
      const OTHER = 'nh_live_other'
      const other = workspace(7).map((f) => ({
        ...f,
        records: f.records.map((r) => ({ ...r, id: `b-${r.id}` })),
      }))
      fakeNetHunt(workspace(7), { byToken: { [OTHER]: other } })
      await adapter[method](CREDS, { page: 1, limit: 3 })
      await adapter[method](CREDS, { page: 2, limit: 3 })
      const rows = await adapter[method]({ accessToken: OTHER }, { page: 2, limit: 3 })
      expect(rows.map((r) => r.id)).toEqual([4, 5, 6].map((n) => `b-${prefix}-${n}`))
    })

    it('clamps the page size to the documented maximum of 1000 and reports it', async () => {
      const { sent } = fakeNetHunt(workspace(2))
      const params = withPageSink({ page: 1, limit: 5000 } as QueryParams)
      const rows = await adapter[method](CREDS, params)
      expect(rows).toHaveLength(2)
      const filter = sent.find((s) => s.url.pathname.endsWith('/records/filter'))!
      expect(filter.url.searchParams.get('limit')).toBe('1000')
      expect(readUpstreamPage(params)).toMatchObject({ pageSize: 1000, hasMore: false })
    })

    it('refuses with 501 when the workspace has no folder with the role', async () => {
      fakeNetHunt([{ folder: folder('f-other'), records: records('other', 1) }])
      await expect(adapter[method](CREDS, { page: 1, limit: 10 })).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
      })
    })

    it('refuses an ambiguous role rather than picking a folder', async () => {
      const ws = workspace(1)
      const dup = ws.find((f) => f.folder.id === folderId)!
      fakeNetHunt([...ws, { ...dup, folder: { ...dup.folder, id: `${folderId}-2` } }])
      await expect(adapter[method](CREDS, { page: 1, limit: 10 })).rejects.toMatchObject({
        statusCode: 409,
      })
    })
  },
)

describe('nethunt-crm transport', () => {
  it('sends the API key as a Bearer token to https://nethunt.com/api/v2', async () => {
    const { sent, spy } = fakeNetHunt(workspace(1))
    await adapter.listContacts(CREDS, { page: 1, limit: 10 })
    expect(sent[0]!.url.origin).toBe('https://nethunt.com')
    expect(sent[0]!.url.pathname).toBe('/api/v2/folders')
    const init = spy.mock.calls[0]![1]!
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`)
  })
})

describe('nethunt-crm get* read back list ids', () => {
  it.each([
    ['getContact', 'f-contact', 'contact-2', ContactSchema],
    ['getCompany', 'f-company', 'company-2', CompanySchema],
    ['getDeal', 'f-deal', 'deal-2', DealSchema],
    ['getActivity', 'f-task', 'task-2', ActivitySchema],
  ] as const)(
    '%s reads GET /api/v2/folders/%s/records/{id}',
    async (method, folderId, id, schema) => {
      const { sent } = fakeNetHunt(workspace(3))
      const out = schema.parse(await adapter[method](CREDS, id)) as { id: string }
      expect(out.id).toBe(id)
      expect(
        sent.some(
          (s) =>
            s.method === 'GET' && s.url.pathname === `/api/v2/folders/${folderId}/records/${id}`,
        ),
      ).toBe(true)
    },
  )
})

describe('nethunt-crm response shapes', () => {
  it('answers 502 when GET /folders is not the documented array', async () => {
    fakeNetHunt(workspace(1), { malformed: 'folders' })
    await expect(adapter.listContacts(CREDS, { page: 1, limit: 10 })).rejects.toMatchObject({
      statusCode: 502,
    })
  })

  it('answers 502 when records/filter has no records array', async () => {
    fakeNetHunt(workspace(1), { malformed: 'filter' })
    await expect(adapter.listContacts(CREDS, { page: 1, limit: 10 })).rejects.toMatchObject({
      statusCode: 502,
    })
  })
})

describe('nethunt-crm listActivities', () => {
  it('maps Tasks-folder fields by the roles GET /folders/{id} reports', async () => {
    const { sent } = fakeNetHunt(workspace(2))
    const rows = await adapter.listActivities(CREDS, { page: 1, limit: 10 })
    expect(rows.map((r) => r.done)).toEqual([true, false])
    expect(rows.every((r) => r.type === 'task')).toBe(true)
    expect(
      sent.some((s) => s.method === 'GET' && s.url.pathname === '/api/v2/folders/f-task'),
    ).toBe(true)
  })

  it('getActivity maps the same role-bound fields as the list', async () => {
    const { sent } = fakeNetHunt(workspace(2))
    // workspace() sets Completed (field 12) to true on task-1, false on task-2
    const done = ActivitySchema.parse(await adapter.getActivity(CREDS, 'task-1'))
    const open = ActivitySchema.parse(await adapter.getActivity(CREDS, 'task-2'))
    expect(done.done).toBe(true)
    expect(open.done).toBe(false)
    expect(
      sent.some((s) => s.method === 'GET' && s.url.pathname === '/api/v2/folders/f-task'),
    ).toBe(true)
  })
})

describe('nethunt-crm refusals send nothing', () => {
  it('listPipelines throws 501 NOT_SUPPORTED without a request', async () => {
    const { spy } = fakeNetHunt(workspace(1))
    await expect(adapter.listPipelines(CREDS, { page: 1, limit: 10 })).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining('cannot list pipelines'),
    })
    expect(spy).not.toHaveBeenCalled()
  })

  it('getNote throws 501 NOT_SUPPORTED without a request', async () => {
    const { spy } = fakeNetHunt(workspace(1))
    await expect(adapter.getNote(CREDS, 'x')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(spy).not.toHaveBeenCalled()
  })
})

function comments(prefix: string, n: number): NetHuntCommentEvent[] {
  return Array.from({ length: n }, (_, i) =>
    documentedComment({ id: `${prefix}-c${i + 1}`, text: `${prefix} comment ${i + 1}` }),
  )
}

describe('nethunt-crm listNotes flattens record timelines through pageByRows', () => {
  /**
   * 150 contacts (two parent pages of 100), no company folder, two deals.
   * Comments land unevenly: 2 on parent page 1, 3 on parent page 2, none
   * from companies, 2 on the deal page. N = 7 = 2L+1 at L = 3.
   */
  function notesWorkspace(): FakeFolder[] {
    return [
      {
        folder: folder('f-contact', 'contact'),
        records: records('contact', 150),
        comments: {
          'contact-1': comments('contact-1', 2),
          'contact-121': comments('contact-121', 3),
        },
      },
      {
        folder: folder('f-deal', 'deal'),
        records: records('deal', 2),
        comments: { 'deal-2': comments('deal-2', 2) },
      },
    ]
  }

  it('serves every comment once, with hasMore exact', async () => {
    const { sent } = fakeNetHunt(notesWorkspace())
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 3 } as QueryParams)
      const rows = await adapter.listNotes(CREDS, params)
      for (const r of rows) NoteSchema.parse(r)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual([
      'contact-1-c1',
      'contact-1-c2',
      'contact-121-c1',
      'contact-121-c2',
      'contact-121-c3',
      'deal-2-c1',
      'deal-2-c2',
    ])
    expect(hasMore).toEqual([true, true, false])
    // Parent pages are read at the documented default of 100.
    const filters = sent.filter((s) => s.url.pathname.endsWith('/records/filter'))
    expect(new Set(filters.map((s) => s.url.searchParams.get('limit')))).toEqual(new Set(['100']))
    for (const t of sent.filter((s) => s.url.pathname.endsWith('/timeline'))) {
      expect(t.url.searchParams.get('types')).toBe('comment')
    }
  })

  it('attaches each note to its parent record by folder role', async () => {
    fakeNetHunt(notesWorkspace())
    const rows = await adapter.listNotes(CREDS, { page: 1, limit: 100 })
    expect(rows.find((r) => r.id === 'contact-121-c1')?.contact_id).toBe('contact-121')
    expect(rows.find((r) => r.id === 'deal-2-c1')?.deal_id).toBe('deal-2')
    expect(rows.find((r) => r.id === 'deal-2-c1')?.contact_id).toBeUndefined()
  })

  it('reads a timeline to its end through nextCursor', async () => {
    const { sent } = fakeNetHunt([
      {
        folder: folder('f-company', 'company'),
        records: records('company', 1),
        comments: { 'company-1': comments('company-1', 1001) },
      },
    ])
    const rows = await adapter.listNotes(CREDS, { page: 1, limit: 2000 })
    expect(rows).toHaveLength(1001)
    expect(new Set(rows.map((r) => r.id)).size).toBe(1001)
    const timeline = sent.filter((s) => s.url.pathname.endsWith('/timeline'))
    expect(timeline.map((s) => s.url.searchParams.get('cursor'))).toEqual([null, enc(1000)])
    expect(timeline.map((s) => s.url.searchParams.get('limit'))).toEqual(['1000', '1000'])
  })

  it('keeps its row pager per connection, not shared across workspaces', async () => {
    const OTHER = 'nh_live_other'
    const other = notesWorkspace().map((f) => ({
      ...f,
      comments: Object.fromEntries(
        Object.entries(f.comments ?? {}).map(([rid, cs]) => [
          rid,
          cs.map((c) => ({ ...c, id: `b-${c.id}` })),
        ]),
      ),
    }))
    fakeNetHunt(notesWorkspace(), { byToken: { [OTHER]: other } })
    await adapter.listNotes(CREDS, { page: 1, limit: 3 })
    await adapter.listNotes(CREDS, { page: 2, limit: 3 })
    const rows = await adapter.listNotes({ accessToken: OTHER }, { page: 2, limit: 3 })
    expect(rows.map((r) => r.id)).toEqual(['b-contact-121-c2', 'b-contact-121-c3', 'b-deal-2-c1'])
  })

  it('is empty when no parent role is assigned', async () => {
    fakeNetHunt([{ folder: folder('f-other'), records: records('other', 1) }])
    const params = withPageSink({ page: 1, limit: 10 } as QueryParams)
    expect(await adapter.listNotes(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})
