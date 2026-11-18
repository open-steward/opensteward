/**
 * Bitrix24's CRM list methods page by `start` over fixed 50-row pages.
 *
 * crm.contact.list, crm.company.list, crm.deal.list and crm.activity.list
 * (https://apidocs.bitrix24.com/api-reference/crm/contacts/crm-contact-list.html
 * and its siblings): "The page size of results is always static — 50
 * records." and "start = (N-1) * 50, where N — the desired page number". The
 * response's `next`: "Contains the value to be passed in the next request in
 * the start parameter to get the next batch of data." It is absent on the last
 * page (https://apidocs.bitrix24.com/settings/how-to-call-rest-api/list-methods-pecularities.html).
 * There is no page-size parameter.
 *
 * The adapter used to read `start` from params.start / params.cursor, which
 * the router never sets, so every caller page was upstream page 1. The fake
 * Bitrix24 below honours `start` and nothing else, at the seam the adapter
 * calls: global `fetch`.
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
import { Bitrix24Adapter } from '../../../../../../src/verticals/crm/adapters/bitrix24'

const BASE = 'https://portal.example.test'
const CREDS: Credentials = {
  accessToken: 'at-1',
  refreshToken: 'rt-1',
  extra: { baseUrl: BASE },
}
const UPSTREAM = 50

interface Sent {
  method: string
  body: Record<string, unknown>
}

let sent: Sent[] = []
let rowCount = 0
/** When set, the start=0 page carries only this many rows but still sends `next`: 50. */
let shortFirstPage: number | undefined

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String(i + 1))
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Bitrix24 as documented: `start` in multiples of 50, fixed 50-row pages, `next` until the end. */
async function fakeBitrix24(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input))
  const m = /^\/rest\/(crm\.(?:contact|company|deal|activity)\.list)$/.exec(url.pathname)
  if (!m || init?.method !== 'POST') return json(404, { error: 'ERROR_METHOD_NOT_FOUND' })
  const body =
    typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {}
  sent.push({ method: m[1] as string, body })
  // "OAuth Token — passed in the auth parameter of the request"
  // (https://apidocs.bitrix24.com/settings/how-to-call-rest-api/general-principles.html)
  if (body['auth'] !== CREDS.accessToken && body['auth'] !== 'at-2') {
    return json(401, { error: 'NO_AUTH_FOUND' })
  }
  if (new Headers(init.headers).has('authorization'))
    return json(400, { error: 'UNDOCUMENTED_HEADER' })
  const start = Number(body['start'] ?? 0)
  if (!Number.isInteger(start) || start < 0 || start % UPSTREAM !== 0) {
    return json(400, { error: 'INVALID_START' })
  }
  const all = ids(rowCount)
  const end = start === 0 && shortFirstPage !== undefined ? shortFirstPage : start + UPSTREAM
  const rows = all.slice(start, end).map((ID) => ({ ID }))
  const out: Record<string, unknown> = { result: rows, total: rowCount }
  if (start + UPSTREAM < rowCount) out['next'] = start + UPSTREAM
  return json(200, out)
}

beforeEach(() => {
  sent = []
  rowCount = 0
  shortFirstPage = undefined
  _resetRowPager()
  vi.stubGlobal('fetch', vi.fn(fakeBitrix24))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const adapter = new Bitrix24Adapter()

type ListMethod = 'listContacts' | 'listCompanies' | 'listDeals' | 'listActivities'

async function syncPage(
  method: ListMethod,
  page: number,
  limit: number,
): Promise<{ ids: string[]; hasMore: boolean | undefined }> {
  const params: QueryParams = withPageSink({ page, limit })
  const rows = (await adapter[method](CREDS, params)) as Array<{ id: string }>
  return { ids: rows.map((r) => r.id), hasMore: readUpstreamPage(params)?.hasMore }
}

/** The rows of one list call, typed by the one field every canonical row carries. */
async function rowsOf(method: ListMethod, params: QueryParams): Promise<Array<{ id: string }>> {
  return (await adapter[method](CREDS, params)) as Array<{ id: string }>
}

async function walk(method: ListMethod, limit: number): Promise<string[]> {
  const out: string[] = []
  for (let page = 1; page < 200; page++) {
    const { ids: got, hasMore } = await syncPage(method, page, limit)
    out.push(...got)
    if (hasMore === false || (hasMore === undefined && got.length < limit)) return out
  }
  throw new Error('walk did not end')
}

const METHODS = [
  ['listContacts', 'crm.contact.list'],
  ['listCompanies', 'crm.company.list'],
  ['listDeals', 'crm.deal.list'],
  ['listActivities', 'crm.activity.list'],
] as const

describe.each(METHODS)('bitrix24 %s pages by start over 50-row pages', (method, rest) => {
  const L = 30

  it('serves 2L+1 rows over pages 1, 2, 3, each once and in order', async () => {
    rowCount = 2 * L + 1
    const p1 = await syncPage(method, 1, L)
    const p2 = await syncPage(method, 2, L)
    const p3 = await syncPage(method, 3, L)
    expect(p1).toEqual({ ids: ids(61).slice(0, 30), hasMore: true })
    expect(p2).toEqual({ ids: ids(61).slice(30, 60), hasMore: true })
    expect(p3).toEqual({ ids: ids(61).slice(60), hasMore: false })
  })

  it('sends the documented start on the page-2 request', async () => {
    rowCount = 2 * L + 1
    await syncPage(method, 2, L)
    for (const s of sent) expect(s.method).toBe(rest)
    expect(sent.map((s) => s.body['start'])).toContain(UPSTREAM)
  })

  it('reports hasMore false when the rows end exactly on a page', async () => {
    rowCount = 2 * L
    expect(await syncPage(method, 2, L)).toEqual({ ids: ids(60).slice(30), hasMore: false })
  })

  it('serves every row at a limit above the 50-row upstream maximum', async () => {
    rowCount = 1_203
    expect(await walk(method, 500)).toEqual(ids(1_203))
    for (const s of sent) expect(Number(s.body['start']) % UPSTREAM).toBe(0)
    _resetRowPager()
    expect(await syncPage(method, 2, 120)).toEqual({
      ids: ids(1_203).slice(120, 240),
      hasMore: true,
    })
  })

  it('clamps an API limit above the router maximum (no declared max) and still pages', async () => {
    rowCount = 1_203
    const params = parseListQuery({ limit: '9999', page: '2' })
    expect(params.limit).toBe(500)
    const env = listPage(await rowsOf(method, params), params, 'bitrix24')
    expect(env.data.map((r) => r.id)).toEqual(ids(1_203).slice(500, 1_000))
    expect(env.meta.hasMore).toBe(true)
  })

  it('gives meta.hasMore through parseListQuery then listPage', async () => {
    rowCount = 2 * L + 1
    const params2 = parseListQuery({ limit: String(L), page: '2' })
    const env2 = listPage(await rowsOf(method, params2), params2, 'bitrix24')
    expect(env2.data.map((r) => r.id)).toEqual(ids(61).slice(30, 60))
    expect(env2.meta.hasMore).toBe(true)
    const params3 = parseListQuery({ limit: String(L), page: '3' })
    const env3 = listPage(await rowsOf(method, params3), params3, 'bitrix24')
    expect(env3.data.map((r) => r.id)).toEqual(ids(61).slice(60))
    expect(env3.meta.hasMore).toBe(false)
  })

  it('serves the documented 50-row default when the caller sends no limit', async () => {
    rowCount = 120
    const rows = (await adapter[method](CREDS, {})) as Array<{ id: string }>
    expect(rows.map((r) => r.id)).toEqual(ids(120).slice(0, 50))
  })

  it('follows `next` past a short page instead of guessing the end from its length', async () => {
    rowCount = 101
    shortFirstPage = 20
    const expected = [...ids(101).slice(0, 20), ...ids(101).slice(50)]
    expect(await syncPage(method, 1, 60)).toEqual({ ids: expected.slice(0, 60), hasMore: true })
    expect(sent.map((s) => s.body['start'])).toEqual([0, UPSTREAM])
  })

  it('keeps walks of two connections apart', async () => {
    rowCount = 2 * L + 1
    await syncPage(method, 1, L)
    const other: Credentials = { ...CREDS, accessToken: 'at-2', refreshToken: 'rt-2' }
    sent = []
    const params = withPageSink({ page: 2, limit: L })
    await adapter[method](other, params)
    // A fresh connection starts its own walk from the first upstream page.
    expect(sent.map((s) => s.body['start'])).toEqual([0, UPSTREAM])
  })
})
