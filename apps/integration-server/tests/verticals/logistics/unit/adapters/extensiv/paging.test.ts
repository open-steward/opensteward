/**
 * Extensiv (3PL Warehouse Manager) carrier and warehouse lists.
 *
 * First-party source: the 3PL Central REST APIs Postman collection,
 * https://developer.3plcentral.com/api/collections/8399762/SVn3tFsv.
 *
 * - listWarehouses called `GET /warehouses`, which the collection does not
 *   have. Facilities are `GET /properties/facilities` ("Returns a list of all
 *   facilities and their respective details/properties"), paged by `pgsiz`
 *   ("Set max records to return per response") and `pgnum` ("Consider pgsiz,
 *   returns the pgnum-th page, 1-indexed"), answering a HAL object with
 *   `totalResults`.
 * - listCarriers called the real `GET /properties/carriers` but expected an
 *   array, while the documented response is a HAL object, so it always
 *   returned []. That request documents no query parameters, so the adapter
 *   fetches it whole and pages locally.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import { ExtensivAdapter } from '../../../../../../src/verticals/logistics/adapters/extensiv/index'
import { CarrierSchema } from '../../../../../../src/verticals/logistics/schema/carrier'
import { WarehouseSchema } from '../../../../../../src/verticals/logistics/schema/warehouse'

const FACILITY_REL = 'http://api.3plCentral.com/rels/properties/facility'
const CARRIER_REL = 'http://api.3plCentral.com/rels/properties/carrier'
const CREDS = { accessToken: 'tok' }
const L = 4
const N = 2 * L + 1
const CALL_BUDGET = 40

type Call = { path: string; params: Record<string, unknown> }

/**
 * A fake 3PL Warehouse Manager honouring ONLY the documented parameters:
 * `pgsiz`/`pgnum` on /properties/facilities (its server-side default page
 * size is set by `defaultSize`), and none on /properties/carriers. Anything
 * else is a 400; an unknown path is a 404.
 */
function fake(opts: { facilities?: number; carriers?: number; defaultSize?: number } = {}) {
  const log: Call[] = []
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded')
    const params = Object.fromEntries(
      Object.entries(cfg?.params ?? {}).filter(([, v]) => v !== undefined),
    )
    log.push({ path, params })
    if (path === 'properties/facilities') {
      const bad = Object.keys(params).filter((k) => k !== 'pgsiz' && k !== 'pgnum')
      if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
      const size = params.pgsiz === undefined ? (opts.defaultSize ?? 10) : Number(params.pgsiz)
      const num = params.pgnum === undefined ? 1 : Number(params.pgnum)
      const all = Array.from({ length: opts.facilities ?? 0 }, (_, i) => ({
        facilityId: i + 1,
        name: `Facility ${i + 1}`,
        deactivated: false,
      }))
      return {
        data: {
          totalResults: all.length,
          _embedded: { [FACILITY_REL]: all.slice((num - 1) * size, num * size) },
        },
      }
    }
    if (path === 'properties/carriers') {
      if (Object.keys(params).length) throw new Error('400: /properties/carriers takes no params')
      return {
        data: {
          defaultShipmentServices: [{ code: '01', description: 'LTL', shipEngineId: '' }],
          _embedded: {
            [CARRIER_REL]: Array.from({ length: opts.carriers ?? 0 }, (_, i) => ({
              name: `C${i + 1}`,
              description: `Carrier ${i + 1}`,
              deactivated: false,
              shipmentServices: [],
            })),
          },
        },
      }
    }
    throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
  })
  vi.spyOn(axios, 'create').mockImplementation((() => ({
    get,
    post: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: { common: {} } },
  })) as never)
  return { log }
}

afterEach(() => vi.restoreAllMocks())

const adapter = () => new ExtensivAdapter()

describe('extensiv listWarehouses (GET /properties/facilities)', () => {
  it('sends the caller page as pgnum and the exact limit as pgsiz, nothing else', async () => {
    const { log } = fake({ facilities: N })
    await adapter().listWarehouses(CREDS, withPageSink({ page: 2, limit: L }))
    expect(log).toEqual([{ path: 'properties/facilities', params: { pgnum: 2, pgsiz: L } }])
  })

  it('N = 2L+1: pages 1..3 at limit L return every id once, with exact hasMore', async () => {
    fake({ facilities: N })
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter().listWarehouses(CREDS, params)
      for (const r of rows) seen.push(WarehouseSchema.parse(r).id ?? '<none>')
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
    expect(more).toEqual([true, true, false])
  })

  it('an exact multiple of the limit ends with hasMore false', async () => {
    fake({ facilities: 2 * L })
    const params = withPageSink({ page: 2, limit: L })
    expect(await adapter().listWarehouses(CREDS, params)).toHaveLength(L)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('extensiv getWarehouse (walks /properties/facilities)', () => {
  it('finds a facility on a later page by facilityId, sending only pgnum', async () => {
    const { log } = fake({ facilities: 25, defaultSize: 10 })
    const w = WarehouseSchema.parse(await adapter().getWarehouse(CREDS, '23'))
    expect(w.id).toBe('23')
    expect(log.map((c) => c.params)).toEqual([{ pgnum: 1 }, { pgnum: 2 }, { pgnum: 3 }])
  })

  it('404s after totalResults rows without the id, and stops there', async () => {
    const { log } = fake({ facilities: 20, defaultSize: 10 })
    await expect(adapter().getWarehouse(CREDS, '99')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
    expect(log).toHaveLength(2)
  })
})

describe('extensiv listCarriers (GET /properties/carriers)', () => {
  it('sends no query parameters', async () => {
    const { log } = fake({ carriers: 3 })
    await adapter().listCarriers(CREDS, withPageSink({ page: 1, limit: L }))
    expect(log).toEqual([{ path: 'properties/carriers', params: {} }])
  })

  it('N = 2L+1: pages 1..3 at limit L return every carrier once, with exact hasMore', async () => {
    fake({ carriers: N })
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter().listCarriers(CREDS, params)
      for (const r of rows) seen.push(CarrierSchema.parse(r).id ?? '<none>')
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `C${i + 1}`))
    expect(more).toEqual([true, true, false])
  })
})

describe('extensiv getCarrier', () => {
  it('reads the carrier by name from the documented collection', async () => {
    const { log } = fake({ carriers: 3 })
    const c = CarrierSchema.parse(await adapter().getCarrier(CREDS, 'C2'))
    expect(c.name).toBe('Carrier 2')
    expect(c.services?.[0].code).toBe('01')
    expect(log).toEqual([{ path: 'properties/carriers', params: {} }])
  })

  it('404s for an unknown name', async () => {
    fake({ carriers: 3 })
    await expect(adapter().getCarrier(CREDS, 'nope')).rejects.toMatchObject({ statusCode: 404 })
  })
})
