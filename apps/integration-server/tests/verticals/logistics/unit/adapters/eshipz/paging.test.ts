/**
 * eShipz listCarriers paging: the carrier list is derived from one
 * POST /api/v2/services ("Service Availability") response, which does not
 * paginate, so the adapter slices the caller's page locally.
 *
 * First-party doc (eShipz's Postman documenter, served from apidocs.eshipz.com):
 * https://apidocs.eshipz.com/ — collection JSON at
 * https://apidocs.eshipz.com/api/collections/528834/2sBXqGqgfn
 *
 *   "POST /api/v2/services | Service Availability" — the documented request
 *   carries only a shipment body (is_document, shipment{ship_from, ship_to,
 *   parcels, ...}); there is no page, limit, offset or cursor. The documented
 *   response is one array: {"data":{"rates":[{"code":200,"description":...,
 *   "slug":"bluedart",...,"vendor_id":"7117758486"}, ...]}}.
 *
 * Before this fix the adapter returned every carrier on every page, so page 2
 * repeated page 1.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { EshipzAdapter } from '../../../../../../src/verticals/logistics/adapters/eshipz/index'

const CREDS = { accessToken: 'eshipz-test-token' }
const CALL_BUDGET = 20
const L = 5
const N = 2 * L + 1

const SERVICES_BODY_KEYS = ['is_document', 'shipment']

const vendorId = (i: number) => String(7117758000 + i)
const vendorIds = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => vendorId(from + i))

/**
 * A fake eShipz that honours ONLY the documented Service Availability request:
 * a body with no paging keys, and every rate in one `data.rates` array. A
 * duplicate slug is included to keep the adapter's de-duplication honest.
 */
function fakeEshipz(total: number) {
  let calls = 0
  const post = vi.fn(async (path: string, body: Record<string, unknown>) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    if (path !== 'services') throw new Error(`unexpected path ${path}`)
    const bad = Object.keys(body).filter((k) => !SERVICES_BODY_KEYS.includes(k))
    if (bad.length) throw new Error(`400: undocumented body keys ${bad.join(',')}`)
    const rates = Array.from({ length: total }, (_, i) => ({
      code: 200,
      description: `Vendor ${i + 1}`,
      slug: `carrier-${i + 1}`,
      technicality: [],
      vendor_id: vendorId(i + 1),
    }))
    if (total > 0) rates.push({ ...rates[0]!, code: 400, description: 'dup account' })
    return { data: { data: { rates } } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get: vi.fn(), post, delete: vi.fn() } as never)
  return { post }
}

afterEach(() => vi.restoreAllMocks())

describe('eshipz listCarriers paging', () => {
  const adapter = () => new EshipzAdapter()

  it('N = 2L+1 carriers: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeEshipz(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await adapter().listCarriers(CREDS, params)
      seen.push(...rows.map((r) => r.id as string))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ totalCount: N, pagedLocally: true }),
      )
    }
    expect(seen).toEqual(vendorIds(1, N))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request is the documented unpaged POST /v2/services, with no invented paging key', async () => {
    const { post } = fakeEshipz(N)
    await adapter().listCarriers(CREDS, withPageSink({ page: 2, limit: L }))
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0]![0]).toBe('services')
    const body = post.mock.calls[0]![1] as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual([...SERVICES_BODY_KEYS].sort())
    expect(JSON.stringify(body)).not.toMatch(/"(page|limit|offset|cursor)"/)
  })

  it('a limit above the router maximum is clamped, and serves every carrier with hasMore false', async () => {
    fakeEshipz(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBeLessThan(100000)
    const rows = await adapter().listCarriers(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(vendorIds(1, N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with exact meta', async () => {
    fakeEshipz(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter().listCarriers(CREDS, params), params, 'eshipz')
    expect(env.data.map((r) => r.id)).toEqual(vendorIds(L + 1, L))
    expect(env.meta).toEqual(
      expect.objectContaining({ page: 2, limit: L, totalCount: N, hasMore: true }),
    )
  })
})
