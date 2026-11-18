/**
 * Efficy reads against the public REST API documented at
 * https://help.efficy.cloud/api/efficyU_public_api_spec.yaml (OpenAPI 3.0.2):
 *
 *   servers:
 *   - url: https://customer-name.efficytest.cloud
 *   "include it in the `X-Api-Key` header in all API requests"
 *
 * Every list endpoint used here (GET /api/v1/contacts, /companies,
 * /opportunities, /meetings) documents three query parameters:
 *
 *   order_by: "Specify the field(s) to order results by. Use comma-separated values for multiple fields."
 *   offset:   "Specify the starting index for pagination (default is 0)."
 *   limit:    "Specify the maximum number of records to return (default is 20)."
 *
 * and the response
 *
 *   { "records_found": 100, "next": "/api/v1/companies?offset=20&limit=20",
 *     "previous": "/api/v1/companies?offset=0&limit=20", "data": [...] }
 *
 * No maximum limit is documented. No pipeline, stage or note resource exists
 * in the spec, so those calls refuse before sending anything.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, type QueryParams } from '@opensteward/shared'
import { EfficyAdapter } from '../../../../../../src/verticals/crm/adapters/efficy/index'

const HOST = 'https://acme.efficytest.cloud'
const CREDS = { accessToken: 'efficy-key', extra: { instanceUrl: HOST } }

const DOCUMENTED = new Set(['offset', 'limit', 'order_by'])

interface Sent {
  path: string
  offset: number
  limit: number
  orderBy: string | null
  apiKey: string | null
  authorization: string | null
}

/** A row carrying the fields each transform requires. */
function row(resource: string, i: number): Record<string, unknown> {
  const crm_id = `ID${String(i).padStart(6, '0')}`
  if (resource === 'contacts') return { crm_id, first_name: `f${i}`, last_name: `l${i}` }
  if (resource === 'meetings') return { crm_id, title: `m${i}` }
  return { crm_id, name: `n${i}` }
}

/**
 * A fake Efficy that honours ONLY the documented list parameters (offset,
 * default 0; limit, default 20; order_by) and refuses anything else, and
 * answers with the documented envelope. `next` is present only while rows
 * remain past this page.
 */
function fakeEfficy(resource: string, total: number, opts: { alwaysNext?: boolean } = {}) {
  const store = Array.from({ length: total }, (_, i) => row(resource, i + 1))
  // Shuffle so only an order_by=crm_id request gets a stable crm_id order.
  const unordered = [...store].reverse()
  const sent: Sent[] = []
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    const s: Sent = {
      path: url.pathname,
      offset: Number(url.searchParams.get('offset') ?? 0),
      limit: Number(url.searchParams.get('limit') ?? 20),
      orderBy: url.searchParams.get('order_by'),
      apiKey: headers.get('x-api-key'),
      authorization: headers.get('authorization'),
    }
    sent.push(s)
    if (url.origin !== HOST) return new Response('wrong host', { status: 404 })
    if (s.apiKey !== 'efficy-key') return new Response('{"message":"no key"}', { status: 401 })
    for (const k of url.searchParams.keys()) {
      if (!DOCUMENTED.has(k)) return new Response(`undocumented param ${k}`, { status: 400 })
    }
    const single = url.pathname.match(/^\/api\/v1\/(\w+)\/([^/]+)$/)
    if (single && single[1] === resource) {
      const hit = store.find((r) => r['crm_id'] === decodeURIComponent(single[2]!))
      return hit ? Response.json(hit) : new Response('{}', { status: 404 })
    }
    if (url.pathname !== `/api/v1/${resource}`) return new Response('not found', { status: 404 })
    const rows = s.orderBy === 'crm_id' ? store : unordered
    const data = rows.slice(s.offset, s.offset + s.limit)
    const more = opts.alwaysNext === true || s.offset + s.limit < rows.length
    return Response.json({
      records_found: rows.length,
      ...(more
        ? { next: `/api/v1/${resource}?offset=${s.offset + s.limit}&limit=${s.limit}` }
        : {}),
      previous: `/api/v1/${resource}?offset=${Math.max(0, s.offset - s.limit)}&limit=${s.limit}`,
      data,
    })
  })
  return { store, sent, spy }
}

const LISTS = [
  { method: 'listContacts', resource: 'contacts' },
  { method: 'listCompanies', resource: 'companies' },
  { method: 'listDeals', resource: 'opportunities' },
  { method: 'listActivities', resource: 'meetings' },
] as const

const GETS = [
  { method: 'getContact', resource: 'contacts' },
  { method: 'getCompany', resource: 'companies' },
  { method: 'getDeal', resource: 'opportunities' },
  { method: 'getActivity', resource: 'meetings' },
] as const

afterEach(() => {
  vi.restoreAllMocks()
})

describe('efficy list paging', () => {
  for (const { method, resource } of LISTS) {
    it(`${method} walks GET /api/v1/${resource} by offset/limit: N = 2L+1 rows, every id once, hasMore exact`, async () => {
      const L = 3
      const N = 2 * L + 1
      const { store, sent } = fakeEfficy(resource, N)
      const adapter = new EfficyAdapter()
      const seen: string[] = []
      const hasMore: Array<boolean | undefined> = []
      for (let page = 1; page <= 3; page++) {
        const params = withPageSink({ page, limit: L } as QueryParams)
        const rows = (await adapter[method](CREDS, params)) as Array<{ id: string }>
        seen.push(...rows.map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(store.map((r) => r['crm_id']))
      expect(new Set(seen).size).toBe(N)
      expect(hasMore).toEqual([true, true, false])
      expect(sent.map((s) => [s.path, s.offset, s.limit, s.orderBy])).toEqual([
        [`/api/v1/${resource}`, 0, L, 'crm_id'],
        [`/api/v1/${resource}`, L, L, 'crm_id'],
        [`/api/v1/${resource}`, 2 * L, L, 'crm_id'],
      ])
    })

    it(`${method} sends the X-Api-Key header to the connection's host, never a Bearer token`, async () => {
      const { sent } = fakeEfficy(resource, 1)
      await new EfficyAdapter()[method](
        { accessToken: 'efficy-key', extra: { instanceUrl: `${HOST}/` } },
        withPageSink({ page: 1, limit: 50 } as QueryParams),
      )
      expect(sent).toHaveLength(1)
      expect(sent[0]!.apiKey).toBe('efficy-key')
      expect(sent[0]!.authorization).toBeNull()
      expect(sent[0]!.limit).toBe(50)
    })

    it(`${method} reports no more rows on a full last page with no next`, async () => {
      fakeEfficy(resource, 4)
      const params = withPageSink({ page: 2, limit: 2 } as QueryParams)
      const rows = await new EfficyAdapter()[method](CREDS, params)
      expect(rows).toHaveLength(2)
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })
  }

  it('ends on a short page even when the platform still sends a next link', async () => {
    fakeEfficy('contacts', 5, { alwaysNext: true })
    const params = withPageSink({ page: 2, limit: 3 } as QueryParams)
    const rows = await new EfficyAdapter().listContacts(CREDS, params)
    expect(rows).toHaveLength(2)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('refuses a connection with no instanceUrl instead of guessing a host', async () => {
    const { sent } = fakeEfficy('contacts', 1)
    await expect(
      new EfficyAdapter().listContacts({ accessToken: 'efficy-key' }, {
        page: 1,
        limit: 10,
      } as QueryParams),
    ).rejects.toThrow(/instanceUrl/)
    expect(sent).toHaveLength(0)
  })
})

describe('efficy reads by id', () => {
  for (const { method, resource } of GETS) {
    it(`${method} reads GET /api/v1/${resource}/{id}`, async () => {
      const { store, sent } = fakeEfficy(resource, 3)
      const id = String(store[1]!['crm_id'])
      const out = (await new EfficyAdapter()[method](CREDS, id)) as { id: string }
      expect(out.id).toBe(id)
      expect(sent.map((s) => s.path)).toEqual([`/api/v1/${resource}/${id}`])
    })
  }
})

describe('efficy refusals', () => {
  const cases: Array<[string, (a: EfficyAdapter) => Promise<unknown>]> = [
    ['listPipelines', (a) => a.listPipelines(CREDS, { page: 1, limit: 10 } as QueryParams)],
    ['listNotes', (a) => a.listNotes(CREDS, { page: 1, limit: 10 } as QueryParams)],
    ['getNote', (a) => a.getNote(CREDS, 'x')],
  ]
  for (const [name, call] of cases) {
    it(`${name} throws 501 NOT_SUPPORTED and sends no request`, async () => {
      const spy = vi.spyOn(globalThis, 'fetch')
      await expect(call(new EfficyAdapter())).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
      })
      expect(spy).not.toHaveBeenCalled()
    })
  }
})

describe('efficy connect form', () => {
  it('stores the site URL in extra.instanceUrl and the key as the access token', async () => {
    const adapter = new EfficyAdapter()
    expect(adapter.credentialFields().map((f) => f.name)).toEqual(['instanceUrl', 'apiKey'])
    await expect(
      adapter.exchangeCredentials({ instanceUrl: `${HOST}/`, apiKey: ' k ' }),
    ).resolves.toEqual({ accessToken: 'k', extra: { instanceUrl: HOST } })
    await expect(adapter.exchangeCredentials({ apiKey: 'k' })).rejects.toThrow(/Site URL/)
  })
})
