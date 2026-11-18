/**
 * Attio's list endpoints page by limit and offset, not by cursor.
 *
 * Records (people, companies, deals): POST /v2/objects/{object}/records/query
 * (https://docs.attio.com/rest-api/endpoint-reference/records/list-records),
 * body `offset`: "The number of results to skip over before returning.
 * Defaults to 0." and body `limit`: "The maximum number of results to return.
 * Defaults to 500." No maximum is documented.
 *
 * Notes: GET /v2/notes
 * (https://docs.attio.com/rest-api/endpoint-reference/notes/list-notes),
 * query `offset`: "The number of results to skip over before returning. The
 * default is `0`." and query `limit`: "The maximum number of results to
 * return. The default is `10` and the maximum is `50`."
 *
 * Both answer with `{ data }` only. The end, from
 * https://docs.attio.com/rest-api/guides/pagination: "If the number of results
 * you receive is less than the value of the `limit` parameter ... you have
 * reached the end of the result set".
 *
 * The adapter used to send only `limit` (plus an undocumented `cursor`), so
 * page 2 repeated page 1. The fake Attio below honours `limit` and `offset`
 * and nothing else, at the seam the adapter calls: global `fetch`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { AttioAdapter } from '../../../../../../src/verticals/crm/adapters/attio'

const CREDS: Credentials = { accessToken: 'at-1', refreshToken: 'rt-1' }
const NOTES_MAX = 50

interface Sent {
  method: string
  url: URL
  body: Record<string, unknown> | undefined
}

let sent: Sent[] = []
let recordCount = 0
let noteCount = 0
/** When set, ids carry the caller's token and collection, so a row served to the wrong key shows. */
let tagRows = false

function tag(
  rows: Array<Record<string, unknown>>,
  token: string,
  collection: string,
): Array<Record<string, unknown>> {
  if (!tagRows) return rows
  return rows.map((r) => {
    const id = r['id'] as Record<string, string>
    const k = Object.keys(id)[0] as string
    return { ...r, id: { [k]: `${token}:${collection}:${id[k]}` } }
  })
}

function recordRows(n: number): Array<Record<string, unknown>> {
  return Array.from({ length: n }, (_, i) => ({
    id: { record_id: `r${String(i + 1).padStart(4, '0')}` },
    values: {},
  }))
}
function noteRows(n: number): Array<Record<string, unknown>> {
  return Array.from({ length: n }, (_, i) => ({
    id: { note_id: `n${String(i + 1).padStart(4, '0')}` },
  }))
}
function recordIds(n: number): string[] {
  return recordRows(n).map((r) => (r['id'] as { record_id: string }).record_id)
}
function noteIds(n: number): string[] {
  return noteRows(n).map((r) => (r['id'] as { note_id: string }).note_id)
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Attio as documented: `limit` and `offset`, nothing else. */
async function fakeAttio(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input))
  const method = init?.method ?? 'GET'
  const body =
    typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined
  sent.push({ method, url, body })
  const token = new Headers(init?.headers).get('Authorization')?.replace('Bearer ', '') ?? ''

  const records = /^\/v2\/objects\/(people|companies|deals)\/records\/query$/.exec(url.pathname)
  if (method === 'POST' && records) {
    const limit = (body?.['limit'] as number | undefined) ?? 500
    const offset = (body?.['offset'] as number | undefined) ?? 0
    const rows = recordRows(recordCount).slice(offset, offset + limit)
    return json(200, { data: tag(rows, token, records[1] as string) })
  }
  if (method === 'GET' && url.pathname === '/v2/notes') {
    const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 10
    const offset = url.searchParams.has('offset') ? Number(url.searchParams.get('offset')) : 0
    if (limit > NOTES_MAX) return json(400, { message: 'limit must be at most 50' })
    return json(200, {
      data: tag(noteRows(noteCount).slice(offset, offset + limit), token, 'notes'),
    })
  }
  return json(404, { message: `no route ${method} ${url.pathname}` })
}

beforeEach(() => {
  sent = []
  recordCount = 0
  noteCount = 0
  tagRows = false
  _resetRowPager()
  vi.stubGlobal('fetch', vi.fn(fakeAttio))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const adapter = new AttioAdapter()

type ListMethod = 'listContacts' | 'listCompanies' | 'listDeals' | 'listNotes'

async function syncPage(
  method: ListMethod,
  page: number,
  limit: number,
): Promise<{ ids: string[]; hasMore: boolean | undefined }> {
  const params: QueryParams = withPageSink({ page, limit })
  const rows = (await adapter[method](CREDS, params)) as Array<{ id: string }>
  return { ids: rows.map((r) => r.id), hasMore: readUpstreamPage(params)?.hasMore }
}

/** Walk like the sync worker: until a reported hasMore:false, or a short page. */
async function walk(method: ListMethod, limit: number): Promise<string[]> {
  const out: string[] = []
  for (let page = 1; page < 100; page++) {
    const { ids, hasMore } = await syncPage(method, page, limit)
    out.push(...ids)
    if (hasMore === false || (hasMore === undefined && ids.length < limit)) return out
  }
  throw new Error('walk did not end')
}

const RECORD_METHODS = [
  ['listContacts', 'people'],
  ['listCompanies', 'companies'],
  ['listDeals', 'deals'],
] as const

describe.each(RECORD_METHODS)('attio %s pages by offset', (method, object) => {
  const L = 10

  it('serves 2L+1 rows over pages 1, 2, 3, each once and in order', async () => {
    recordCount = 2 * L + 1
    const p1 = await syncPage(method, 1, L)
    const p2 = await syncPage(method, 2, L)
    const p3 = await syncPage(method, 3, L)
    expect(p1).toEqual({ ids: recordIds(21).slice(0, 10), hasMore: true })
    expect(p2).toEqual({ ids: recordIds(21).slice(10, 20), hasMore: true })
    expect(p3).toEqual({ ids: recordIds(21).slice(20), hasMore: false })
  })

  it('sends the documented offset on page 2', async () => {
    recordCount = 2 * L + 1
    await syncPage(method, 2, L)
    for (const s of sent) expect(s.url.pathname).toBe(`/v2/objects/${object}/records/query`)
    expect(sent.map((s) => s.body)).toContainEqual({ limit: L, offset: L })
  })

  it('reports hasMore false when the records end exactly on a page', async () => {
    recordCount = 2 * L
    expect(await syncPage(method, 2, L)).toEqual({ ids: recordIds(20).slice(10), hasMore: false })
  })

  it('serves every row at the sync worker page size, min(500, declared max)', async () => {
    recordCount = 1_203
    expect(adapter.capabilities.maxPageSize).toBe(50)
    expect(await walk(method, Math.min(500, adapter.capabilities.maxPageSize))).toEqual(
      recordIds(1_203),
    )
    for (const s of sent) expect(s.body?.['limit']).toBe(50)
  })

  it('gives meta.hasMore through parseListQuery then listPage', async () => {
    recordCount = 25
    const params2 = parseListQuery({ limit: '10', page: '2' }, adapter)
    const env2 = listPage<{ id: string }>(await adapter[method](CREDS, params2), params2, 'attio')
    expect(env2.data.map((r) => r.id)).toEqual(recordIds(25).slice(10, 20))
    expect(env2.meta.hasMore).toBe(true)
    const params3 = parseListQuery({ limit: '10', page: '3' }, adapter)
    const env3 = listPage<{ id: string }>(await adapter[method](CREDS, params3), params3, 'attio')
    expect(env3.data.map((r) => r.id)).toEqual(recordIds(25).slice(20))
    expect(env3.meta.hasMore).toBe(false)
  })
})

describe('attio listNotes pages by offset, at most 50 a request', () => {
  const L = 10

  it('serves 2L+1 notes over pages 1, 2, 3, each once, with hasMore exact', async () => {
    noteCount = 2 * L + 1
    const p1 = await syncPage('listNotes', 1, L)
    const p2 = await syncPage('listNotes', 2, L)
    const p3 = await syncPage('listNotes', 3, L)
    expect(p1).toEqual({ ids: noteIds(21).slice(0, 10), hasMore: true })
    expect(p2).toEqual({ ids: noteIds(21).slice(10, 20), hasMore: true })
    expect(p3).toEqual({ ids: noteIds(21).slice(20), hasMore: false })
  })

  it('sends the documented offset on page 2', async () => {
    noteCount = 2 * L + 1
    await syncPage('listNotes', 2, L)
    const offsets = sent.map((s) => s.url.searchParams.get('offset'))
    expect(offsets).toContain(String(L))
    for (const s of sent) {
      expect(s.url.pathname).toBe('/v2/notes')
      expect(s.url.searchParams.get('limit')).toBe(String(L))
    }
  })

  it('reports hasMore false when the notes end exactly on a page', async () => {
    noteCount = 2 * L
    expect(await syncPage('listNotes', 2, L)).toEqual({
      ids: noteIds(20).slice(10),
      hasMore: false,
    })
  })

  it('clamps a limit above 50 and still serves every note', async () => {
    noteCount = 1_203
    expect(await walk('listNotes', 500)).toEqual(noteIds(1_203))
    for (const s of sent) expect(s.url.searchParams.get('limit')).toBe('50')
    const p2 = await syncPage('listNotes', 2, 100)
    expect(p2).toEqual({ ids: noteIds(1_203).slice(100, 200), hasMore: true })
  })

  it('clamps an API limit above 50 through the declared maximum', async () => {
    noteCount = 120
    const params = parseListQuery({ limit: '100', page: '2' }, adapter)
    expect(params.limit).toBe(50)
    const env = listPage(await adapter.listNotes(CREDS, params), params, 'attio')
    expect(env.data.map((n) => n.id)).toEqual(noteIds(120).slice(50, 100))
    expect(env.meta.hasMore).toBe(true)
  })

  it('gives meta.hasMore through parseListQuery then listPage', async () => {
    noteCount = 2 * L + 1
    const params = parseListQuery({ limit: '10', page: '2' }, adapter)
    const env = listPage(await adapter.listNotes(CREDS, params), params, 'attio')
    expect(env.data.map((n) => n.id)).toEqual(noteIds(21).slice(10, 20))
    expect(env.meta.hasMore).toBe(true)
    const params3 = parseListQuery({ limit: '10', page: '3' }, adapter)
    const env3 = listPage(await adapter.listNotes(CREDS, params3), params3, 'attio')
    expect(env3.meta.hasMore).toBe(false)
  })
})

describe.each(RECORD_METHODS)('attio %s asks upstream only as often as it must', (method) => {
  const L = 10

  it('fetches each upstream page once over a walk, ending on the short page', async () => {
    recordCount = 2 * L + 1
    await walk(method, L)
    expect(sent.map((s) => s.body?.['offset'])).toEqual([0, 10, 20])
  })

  it('treats a page one short of the limit as the end', async () => {
    recordCount = 2 * L - 1
    expect(await walk(method, L)).toEqual(recordIds(19))
    expect(sent.map((s) => s.body?.['offset'])).toEqual([0, 10])
  })
})

describe('attio pager keys are per connection and per collection', () => {
  const CREDS_B: Credentials = { accessToken: 'at-2', refreshToken: 'rt-2' }
  const COLLECTION = {
    listContacts: 'people',
    listCompanies: 'companies',
    listDeals: 'deals',
    listNotes: 'notes',
  } as const
  const METHODS = Object.keys(COLLECTION) as Array<keyof typeof COLLECTION>

  async function ids(method: ListMethod, creds: Credentials, page: number): Promise<string[]> {
    const rows = (await adapter[method](creds, withPageSink({ page, limit: 10 }))) as Array<{
      id: string
    }>
    return rows.map((r) => r.id)
  }

  // Page 1 fetches, and peeks at page 2's rows. A page-2 call under the same
  // key is then served from that memo with no request, so a key shared across
  // connections or collections would hand over the first caller's rows.
  it('never serves one connection the rows another connection fetched', async () => {
    tagRows = true
    recordCount = 25
    noteCount = 25
    for (const method of METHODS) {
      const a = await ids(method, CREDS, 1)
      const b = await ids(method, CREDS_B, 2)
      expect(a.map((id) => id.split(':')[0])).toEqual(Array(10).fill('at-1'))
      expect(b.map((id) => id.split(':')[0])).toEqual(Array(10).fill('at-2'))
    }
  })

  it('never serves one collection the rows another collection fetched', async () => {
    tagRows = true
    recordCount = 25
    noteCount = 25
    for (const page of [1, 2]) {
      for (const method of METHODS) {
        const got = await ids(method, CREDS, page)
        expect(got).toHaveLength(10)
        for (const id of got) expect(id.split(':')[1]).toBe(COLLECTION[method])
      }
    }
  })
})
