/**
 * Planhat's end user, company, opportunity and conversation lists, paged as
 * documented.
 *
 * https://www.planhat.com/developers/api/enduser:
 *   "limit: Limit the list length. Default as 100, max. 2000.
 *    offset: Start the list on a specific integer index."
 *   Example request: 'https://api.planhat.com/endusers?limit=2&offset=0'
 * https://www.planhat.com/developers/api/company:
 *   "limit: Limit the list length. Default as 100, max. 5000.
 *    offset: Start the list on a specific integer index."
 * https://www.planhat.com/developers/api/opportunity and
 * https://www.planhat.com/developers/api/conversation:
 *   "limit: Limit the list length. Default as 100 [30 for conversations], max. 2000.
 *    offset: Start the list on a specific integer index."
 *
 * Responses are bare JSON arrays with no total, so only a full page implies
 * more. All four used to send offset=0 on every page, and listContacts called
 * an undocumented singular /enduser. The fake Planhat below serves only the
 * documented paths and honours only `limit` and `offset`, at the seam the
 * adapter calls: global `fetch`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { PlanhatAdapter } from '../../../../../../src/verticals/crm/adapters/planhat'

const CREDS: Credentials = { accessToken: 'tok-1' }

const ENDPOINTS = {
  listContacts: { path: '/endusers', def: 100, max: 2000 },
  listCompanies: { path: '/companies', def: 100, max: 5000 },
  listDeals: { path: '/opportunities', def: 100, max: 2000 },
  listNotes: { path: '/conversations', def: 30, max: 2000 },
} as const
type ListMethod = keyof typeof ENDPOINTS

interface Sent {
  path: string
  query: Record<string, string>
}

let sent: Sent[] = []
let rowCount = 0

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `r${i + 1}`)
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function fakePlanhat(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input))
  const query = Object.fromEntries(url.searchParams.entries())
  if ((init?.method ?? 'GET') !== 'GET') return json(405, {})
  // authentication-limits: "The Token should be placed in the Authorization header"; every example
  // request: "--header 'Authorization: Bearer {{apiToken}}'".
  const auth = new Headers(init?.headers).get('Authorization')
  if (auth !== `Bearer ${CREDS.accessToken}`) return json(401, { message: 'unauthorized' })
  sent.push({ path: url.pathname, query })
  // "Get endusers by ID": GET https://api.planhat.com/endusers/56bccdf554d64d837d01bf42
  const one = /^\/endusers\/([^/]+)$/.exec(url.pathname)
  if (one && Object.keys(query).length === 0) return json(200, { _id: one[1], name: one[1] })
  const ep = Object.values(ENDPOINTS).find((e) => e.path === url.pathname)
  if (!ep) return json(404, { message: 'not found' })
  const limit = Number(query['limit'] ?? ep.def)
  if (limit > ep.max) return json(400, { message: `limit above max ${ep.max}` })
  const offset = Number(query['offset'] ?? 0)
  return json(
    200,
    ids(rowCount)
      .slice(offset, offset + limit)
      .map((_id) => ({ _id, name: _id, title: _id })),
  )
}

beforeEach(() => {
  sent = []
  rowCount = 0
  vi.stubGlobal('fetch', vi.fn(fakePlanhat))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const adapter = new PlanhatAdapter()

async function callList(method: ListMethod, params: QueryParams): Promise<Array<{ id: string }>> {
  return (await adapter[method](CREDS, params)) as Array<{ id: string }>
}

async function syncPage(
  method: ListMethod,
  page: number,
  limit: number,
): Promise<{ ids: string[]; hasMore: boolean | undefined }> {
  const params = withPageSink({ page, limit })
  const rows = await callList(method, params)
  return { ids: rows.map((r) => r.id), hasMore: readUpstreamPage(params)?.hasMore }
}

describe.each(Object.keys(ENDPOINTS) as ListMethod[])('planhat %s paging', (method) => {
  const L = 20
  const { path, max } = ENDPOINTS[method]

  it('serves 2L+1 rows over pages 1, 2, 3, each once and in order', async () => {
    rowCount = 2 * L + 1
    const all = ids(rowCount)
    expect(await syncPage(method, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await syncPage(method, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('page 2 sends the documented offset and limit', async () => {
    rowCount = 2 * L + 1
    await syncPage(method, 2, L)
    expect(sent).toEqual([{ path, query: { limit: String(L), offset: String(L) } }])
  })

  it('a call without page starts at offset 0', async () => {
    rowCount = 2 * L + 1
    const rows = await callList(method, { limit: L })
    expect(rows.map((r) => r.id)).toEqual(ids(rowCount).slice(0, L))
    expect(sent).toEqual([{ path, query: { limit: String(L), offset: '0' } }])
  })

  it('a call without limit sends the adapter default of 100', async () => {
    rowCount = 5
    await callList(method, { page: 1 })
    expect(sent).toEqual([{ path, query: { limit: '100', offset: '0' } }])
  })

  it('clamps a limit above the documented max and still serves every row', async () => {
    rowCount = 2 * max + 1
    const out: string[] = []
    for (let page = 1; page < 10; page++) {
      const params = withPageSink({ page, limit: max + 1000 })
      const rows = await callList(method, params)
      out.push(...rows.map((r) => r.id))
      expect(readUpstreamPage(params)?.pageSize).toBe(max)
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(sent.every((s) => Number(s.query['limit']) === max)).toBe(true)
    expect(out).toEqual(ids(rowCount))
  })

  it('gives meta.hasMore through parseListQuery then listPage', async () => {
    rowCount = 2 * L + 1
    const all = ids(rowCount)
    const p2 = parseListQuery({ limit: String(L), page: '2' })
    const env2 = listPage(await callList(method, p2), p2, 'planhat')
    expect(env2.data.map((r) => r.id)).toEqual(all.slice(L, 2 * L))
    expect(env2.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ limit: String(L), page: '3' })
    const env3 = listPage(await callList(method, p3), p3, 'planhat')
    expect(env3.data.map((r) => r.id)).toEqual(all.slice(2 * L))
    expect(env3.meta.hasMore).toBe(false)
  })
})

describe('planhat end users', () => {
  it('listContacts calls the documented plural /endusers, never /enduser', async () => {
    rowCount = 3
    const rows = await callList('listContacts', { page: 1, limit: 2 })
    expect(rows.map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(sent.map((s) => s.path)).toEqual(['/endusers'])
  })

  it('getContact reads back a listed id from /endusers/{_id}', async () => {
    const contact = await adapter.getContact(CREDS, '56bccdf554d64d837d01bf42')
    expect(contact.id).toBe('56bccdf554d64d837d01bf42')
    expect(sent).toEqual([{ path: '/endusers/56bccdf554d64d837d01bf42', query: {} }])
  })

  it('getContact encodes the id as one path segment', async () => {
    await adapter.getContact(CREDS, 'extid-a/b?c')
    expect(sent).toEqual([{ path: '/endusers/extid-a%2Fb%3Fc', query: {} }])
  })
})

describe('planhat list response shape', () => {
  it('sends the documented Bearer token', async () => {
    rowCount = 1
    const rows = await callList('listCompanies', { page: 1, limit: 2 })
    expect(rows.map((r) => r.id)).toEqual(['r1'])
  })

  it('rejects a list body that is not the documented bare array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, { data: [{ _id: 'x' }], total: 1 })),
    )
    await expect(callList('listCompanies', { page: 1, limit: 2 })).rejects.toThrow(/array/)
  })
})
