/**
 * jSign list paging.
 *
 * The swagger spec (https://api.jsign.com/swagger/v2/swagger.json) gives
 * POST /api/v2/envelopes/list a ListEnvelopesRequest body with
 * `"page":{"type":"integer","format":"int32"}` and
 * `"page_size":{"type":"integer","format":"int32"}`, and
 * GET /api/v2/templates/list the query params `page_size` and `page`. It
 * documents no response body (`"description": "Success"`), no next-page
 * signal and no maximum page_size: the adapter sends the caller's page and
 * limit, declares no maxPageSize and reports nothing, so the end is judged
 * from a short page.
 *
 * GET /api/v2/envelopes/{envelopeId}/details and /history take only the
 * envelopeId: the whole collection comes back, and the adapter slices it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { JsignAdapter } from '../../../../../../src/verticals/docsign/adapters/jsign/index'
import { DEFAULT_PAGE_SIZE } from '../../../../../../src/verticals/docsign/adapters/jsign/constants'

const CREDS = { accessToken: 'jsign_test' }
const CALL_BUDGET = 30

/**
 * A fake jSign honouring ONLY the documented params: `page` and `page_size`
 * on the two list endpoints (body for envelopes, query for templates),
 * nothing on /details and /history. Any other paging key is refused.
 */
function fakeJsign(total: number) {
  const envelopes = Array.from({ length: total }, (_, i) => ({
    id: `e${i + 1}`,
    name: `E${i + 1}`,
  }))
  const templates = Array.from({ length: total }, (_, i) => ({
    id: `t${i + 1}`,
    name: `T${i + 1}`,
  }))
  let calls = 0
  const slice = (rows: unknown[], args: Record<string, unknown>) => {
    for (const k of Object.keys(args)) {
      if (!['page', 'page_size', 'status', 'start_date'].includes(k)) {
        throw new Error(`400: unknown param ${k}`)
      }
    }
    const page = args['page'] ?? 1
    const size = args['page_size'] ?? 10
    if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) {
      throw new Error(`400: bad page ${String(page)}`)
    }
    if (typeof size !== 'number' || !Number.isInteger(size) || size < 1) {
      throw new Error(`400: bad page_size ${String(size)}`)
    }
    return rows.slice((page - 1) * size, page * size)
  }
  const budget = () => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
  }
  const post = vi.fn(async (path: string, body: Record<string, unknown>) => {
    budget()
    if (path !== '/api/v2/envelopes/list') throw new Error(`unexpected POST ${path}`)
    return { data: { envelopes: slice(envelopes, body) } }
  })
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    budget()
    const params = cfg?.params ?? {}
    if (path === '/api/v2/templates/list') {
      return { data: { templates: slice(templates, params) } }
    }
    if (Object.keys(params).length > 0) throw new Error(`400: ${path} takes no query params`)
    if (path === '/api/v2/envelopes/env1/details') {
      return {
        data: {
          id: 'env1',
          recipients: {
            signers: Array.from({ length: total }, (_, i) => ({
              id: `s${i + 1}`,
              email: `s${i + 1}@example.com`,
            })),
          },
          documents: Array.from({ length: total }, (_, i) => ({
            id: `d${i + 1}`,
            name: `D${i + 1}`,
          })),
        },
      }
    }
    if (path === '/api/v2/envelopes/env1/history') {
      return {
        data: {
          history: Array.from({ length: total }, (_, i) => ({ id: `h${i + 1}`, action: 'viewed' })),
        },
      }
    }
    throw new Error(`unexpected GET ${path}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post, put: vi.fn() } as never)
  return { get, post }
}

const adapter = () => new JsignAdapter()

afterEach(() => vi.restoreAllMocks())

describe('jsign capabilities', () => {
  it('declares no maxPageSize: the swagger spec documents no page_size maximum', () => {
    const caps = (adapter() as { capabilities?: { maxPageSize?: number } }).capabilities
    expect(caps?.maxPageSize).toBeUndefined()
  })
})

const PAGE_METHODS = [
  {
    name: 'listEnvelopes',
    prefix: 'e',
    call: (a: JsignAdapter, p: QueryParams) => a.listEnvelopes(CREDS, p),
    sent: (f: ReturnType<typeof fakeJsign>, n: number) => f.post.mock.calls[n]?.[1],
  },
  {
    name: 'listTemplates',
    prefix: 't',
    call: (a: JsignAdapter, p: QueryParams) => a.listTemplates(CREDS, p),
    sent: (f: ReturnType<typeof fakeJsign>, n: number) => f.get.mock.calls[n]?.[1]?.params,
  },
] as const

describe.each(PAGE_METHODS)('jsign $name page-number paging', ({ call, prefix, sent }) => {
  const L = 4
  const N = 2 * L + 1
  const expected = Array.from({ length: N }, (_, i) => `${prefix}${i + 1}`)

  it('pages 1..3 at limit L return every row once, in order, ending on a short page', async () => {
    fakeJsign(N)
    const seen: string[] = []
    const sizes: number[] = []
    for (const k of [1, 2, 3]) {
      const page = await call(adapter(), withPageSink({ page: k, limit: L }))
      sizes.push(page.length)
      seen.push(...page.map((r) => r.id))
    }
    expect(seen).toEqual(expected)
    expect(sizes).toEqual([L, L, 1])
  })

  it('the page-2 request carries the documented page and page_size', async () => {
    const f = fakeJsign(N)
    await call(adapter(), withPageSink({ page: 1, limit: L }))
    await call(adapter(), withPageSink({ page: 2, limit: L }))
    expect(sent(f, 0)).toEqual({ page_size: L, page: 1 })
    expect(sent(f, 1)).toEqual({ page_size: L, page: 2 })
  })

  it('a large limit is sent verbatim (no documented maximum to clamp to)', async () => {
    const f = fakeJsign(N)
    const params = parseListQuery({ limit: '500' })
    const rows = await call(adapter(), params)
    expect(rows).toHaveLength(N)
    expect(sent(f, 0)).toEqual({ page_size: params.limit, page: 1 })
  })

  it('the API path: parseListQuery + listPage serves pages 2 and 3 with the right hasMore', async () => {
    fakeJsign(N)
    const p2 = parseListQuery({ page: '2', limit: String(L) })
    const env2 = listPage<{ id: string }>(await call(adapter(), p2), p2, 'jsign')
    expect(env2.data.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
    // A full page with no documented next signal is honestly unknown.
    expect(env2.meta.hasMore).toBeNull()
    const p3 = parseListQuery({ page: '3', limit: String(L) })
    const env3 = listPage<{ id: string }>(await call(adapter(), p3), p3, 'jsign')
    expect(env3.data.map((r) => r.id)).toEqual(expected.slice(2 * L))
    expect(env3.meta.hasMore).toBe(false)
  })

  it('a legacy page-number cursor is honoured when no page is given', async () => {
    const f = fakeJsign(N)
    const rows = await call(adapter(), withPageSink({ cursor: '2', limit: L }))
    expect(rows.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
    expect(sent(f, 0)).toEqual({ page_size: L, page: 2 })
  })

  it('page wins over a cursor when both are given', async () => {
    const f = fakeJsign(N)
    await call(adapter(), withPageSink({ page: 3, cursor: '2', limit: L }))
    expect(sent(f, 0)).toEqual({ page_size: L, page: 3 })
  })

  it('a page below 1 is sent as page 1, and a fractional page is floored', async () => {
    const f = fakeJsign(N)
    await call(adapter(), withPageSink({ page: 0, limit: L }))
    await call(adapter(), withPageSink({ page: 2.5, limit: L }))
    expect(sent(f, 0)).toEqual({ page_size: L, page: 1 })
    expect(sent(f, 1)).toEqual({ page_size: L, page: 2 })
  })

  it('with no page or limit, page 1 at the adapter default is sent', async () => {
    const f = fakeJsign(N)
    await call(adapter(), withPageSink({}))
    expect(sent(f, 0)).toEqual({ page_size: DEFAULT_PAGE_SIZE, page: 1 })
  })
})

const LOCAL_METHODS = [
  {
    name: 'listSigners',
    id: (i: number) => `s${i + 1}`,
    call: (a: JsignAdapter, p: QueryParams) => a.listSigners(CREDS, 'env1', p),
  },
  {
    name: 'listDocuments',
    id: (i: number) => `d${i + 1}`,
    call: (a: JsignAdapter, p: QueryParams) => a.listDocuments(CREDS, 'env1', p),
  },
  {
    name: 'listAuditTrailEntries',
    id: (i: number) => `h${i + 1}`,
    call: (a: JsignAdapter, p: QueryParams) => a.listAuditTrailEntries(CREDS, 'env1', p),
  },
] as const

describe.each(LOCAL_METHODS)('jsign $name local paging', ({ call, id }) => {
  const L = 3
  const N = 2 * L + 1
  const expected = Array.from({ length: N }, (_, i) => id(i))

  it('pages 1..3 at limit L return every row once, in order, with exact hasMore', async () => {
    fakeJsign(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit: L })
      const page = await call(adapter(), params)
      expect(page.length).toBeLessThanOrEqual(L)
      seen.push(...page.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
  })

  it('the API path: parseListQuery + listPage serves page 2 with meta.hasMore', async () => {
    fakeJsign(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage<{ id: string }>(await call(adapter(), params), params, 'jsign')
    expect(env.data.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
    expect(env.meta.hasMore).toBe(true)
  })

  it('with no limit, every row is returned', async () => {
    fakeJsign(N)
    expect((await call(adapter(), {})).map((r) => r.id)).toEqual(expected)
  })
})

describe('jsign single-item lookups still see the whole collection', () => {
  it('getSigner finds a signer past the first page', async () => {
    fakeJsign(60)
    const s = await adapter().getSigner(CREDS, 'env1:s55')
    expect(s.id).toBe('s55')
  })

  it('getDocument finds a document past the first page', async () => {
    fakeJsign(60)
    const d = await adapter().getDocument(CREDS, 'env1:d55')
    expect(d.id).toBe('d55')
  })

  it('getAuditTrailEntry indexes the whole trail', async () => {
    fakeJsign(60)
    const e = await adapter().getAuditTrailEntry(CREDS, 'env1:55')
    expect(e.id).toBe('h56')
  })
})
