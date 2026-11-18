/**
 * SMC3 CarrierConnect XL list paging: POST /carrierservices does not paginate,
 * so listCarriers slices the caller's page locally.
 *
 * First-party spec (served by SMC3's own CCXL host, linked from its docs page
 * https://ccxl.smc3.com/CarrierConnectXL/):
 * https://ccxl.smc3.com/CarrierConnectXL/services/rest/v3_2/swagger.yaml
 *
 *   CarrierServicesRequest:
 *     properties:
 *       shipmentDate: { type: string }
 *       service: { $ref: '#/components/schemas/CarrierService' }
 *   CarrierServicesResponse:
 *     properties:
 *       messageStatus: ...
 *       carrierServices: { type: array, items: CarrierScacService }
 *
 * No page, offset, limit or cursor exists anywhere in the spec. Before this fix
 * the adapter sent an invented `pageSize`, page 2 repeated page 1, and carriers
 * past the first page could never be reached.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { Smc3Adapter } from '../../../../../../src/verticals/logistics/adapters/smc3/index'

const CREDS = { accessToken: 'demo@smc3.com|demosmc3|iKWMI09YN5GS' }
const CALL_BUDGET = 20
const L = 5
const N = 2 * L + 1

/** CarrierServicesRequest's only documented properties. */
const CARRIER_SERVICES_KEYS = ['shipmentDate', 'service']

const scacs = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => `SC${String(from + i).padStart(2, '0')}`)

/**
 * A fake CCXL that honours ONLY the documented request body and returns every
 * carrier in one response, as the real endpoint does.
 */
function fakeCcxl(total: number, servicesPerCarrier: (i: number) => number = () => 1) {
  let calls = 0
  const post = vi.fn(async (path: string, body: Record<string, unknown>) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    if (path !== 'carrierservices') throw new Error(`unexpected path ${path}`)
    const bad = Object.keys(body).filter((k) => !CARRIER_SERVICES_KEYS.includes(k))
    if (bad.length) throw new Error(`400: undocumented body properties ${bad.join(',')}`)
    return {
      data: {
        messageStatus: { status: 'SUCCESS' },
        carrierServices: scacs(1, total).flatMap((scac, i) =>
          Array.from({ length: servicesPerCarrier(i) }, (_, j) => ({
            scac,
            carrierName: `Carrier ${scac}`,
            serviceCode: `SVC-${j + 1}`,
          })),
        ),
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get: vi.fn(), post, delete: vi.fn() } as never)
  return { post }
}

afterEach(() => vi.restoreAllMocks())

describe('smc3 listCarriers paging', () => {
  const adapter = () => new Smc3Adapter()

  it('N = 2L+1 carriers: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeCcxl(N)
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
    expect(seen).toEqual(scacs(1, N))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request is the documented unpaged POST /carrierservices, with no invented paging key', async () => {
    const { post } = fakeCcxl(N)
    await adapter().listCarriers(CREDS, withPageSink({ page: 2, limit: L }))
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0]![0]).toBe('carrierservices')
    expect(Object.keys(post.mock.calls[0]![1])).toEqual(['shipmentDate'])
  })

  it('a limit above the router maximum is clamped, and serves every carrier with hasMore false', async () => {
    fakeCcxl(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBeLessThan(100000)
    const rows = await adapter().listCarriers(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(scacs(1, N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with exact meta', async () => {
    fakeCcxl(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter().listCarriers(CREDS, params), params, 'smc3')
    expect(env.data.map((r) => r.id)).toEqual(scacs(L + 1, L))
    expect(env.meta).toEqual(
      expect.objectContaining({ page: 2, limit: L, totalCount: N, hasMore: true }),
    )
  })

  it('pages count carriers, not service rows: a carrier with several services lands on one page only', async () => {
    // Carriers carry 1..3 service rows each (21 rows for 11 carriers), so a
    // slice taken over raw rows would split carriers across pages and miscount.
    const perCarrier = (i: number) => (i % 3) + 1
    fakeCcxl(N, perCarrier)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await adapter().listCarriers(CREDS, params)
      for (const r of rows) {
        const i = scacs(1, N).indexOf(r.id as string)
        expect(r.services?.map((s) => s.code)).toEqual(
          Array.from({ length: perCarrier(i) }, (_, j) => `SVC-${j + 1}`),
        )
      }
      seen.push(...rows.map((r) => r.id as string))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(scacs(1, N))
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
  })
})
