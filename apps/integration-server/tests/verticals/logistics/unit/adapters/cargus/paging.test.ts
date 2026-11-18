/**
 * Cargus `listWarehouses` (GET /api/PickupLocations) is not paginated. The
 * UrgentOnlineAPI operation `PickupLocations_Get` on the first-party developer
 * portal (https://urgentcargus.developer.azure-api.net/, data API
 * .../developer/apis/55acb9ae5f80b911a8f59a5f/operations/PickupLocations_Get)
 * is described as "Gets user pickup locations" and documents exactly one query
 * parameter, `idPickupLocation` — no page, size, cursor or next field. Its
 * sibling list operations (Orders_Get, Awbs_GetByDate) document
 * `pageNumber` / `itemsPerPage`; this one does not.
 *
 * So one response is the whole collection, and the adapter pages it locally.
 * Before this, every caller page returned every location: page 2 repeated
 * page 1 and a sync never saw an end.
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
import { CargusAdapter } from '../../../../../../src/verticals/logistics/adapters/cargus/index'

const CREDS = { accessToken: 'cargus_test' }
const CALL_BUDGET = 20

function locations(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    LocationId: i + 1,
    Name: `PL-${i + 1}`,
    LocalityName: 'Bucuresti',
    CountyName: 'Bucuresti',
  }))
}

/**
 * A fake Cargus that honours ONLY what the portal documents for
 * PickupLocations_Get: a GET on `PickupLocations` returning every location.
 * Any query parameter is refused — the only documented one, idPickupLocation,
 * is a single-record filter, not a paging key.
 */
function fakeCargus(total: number) {
  const all = locations(total)
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
    if (path !== 'PickupLocations') throw new Error(`unexpected path ${path}`)
    if (cfg?.params && Object.keys(cfg.params).length > 0) {
      throw new Error(`undocumented params sent: ${JSON.stringify(cfg.params)}`)
    }
    return { data: all }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: { common: {} } },
  } as never)
  return { get }
}

function ids(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(start + i))
}

const list = (p: QueryParams) => new CargusAdapter().listWarehouses(CREDS, p)

afterEach(() => vi.restoreAllMocks())

describe('cargus listWarehouses paging (unpaginated upstream, paged locally)', () => {
  it('with 2L+1 rows, pages 1..3 at limit L return every location once, in order, hasMore exact', async () => {
    const L = 4
    fakeCargus(2 * L + 1)
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await list(params), params, 'cargus')
      seen.push(...env.data.map((w) => w.id!))
      hasMore.push(env.meta.hasMore as boolean)
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ pagedLocally: true, totalCount: 2 * L + 1 }),
      )
    }
    expect(seen).toEqual(ids(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 returns the second slice, not a repeat of page 1, with a bare documented request', async () => {
    const { get } = fakeCargus(10)
    const page1 = (await list(parseListQuery({ page: '1', limit: '3' }))).map((w) => w.id)
    const page2 = (await list(parseListQuery({ page: '2', limit: '3' }))).map((w) => w.id)
    expect(page1).toEqual(ids(1, 3))
    expect(page2).toEqual(ids(4, 3))
    // No paging key exists upstream; the only documented request is the bare GET.
    expect(get.mock.calls.map((c) => c[0])).toEqual(['PickupLocations', 'PickupLocations'])
  })

  it('a limit larger than the collection returns every location and reports the end', async () => {
    fakeCargus(5)
    const params = withPageSink({ page: 1, limit: 500 })
    const env = listPage(await list(params), params, 'cargus')
    expect(env.data.map((w) => w.id)).toEqual(ids(1, 5))
    expect(env.meta.hasMore).toBe(false)
  })

  it('pages the WHOLE collection at the sync size: 501 rows at limit 500 end on page 2', async () => {
    fakeCargus(501)
    const p1 = withPageSink({ page: 1, limit: 500 })
    const env1 = listPage(await list(p1), p1, 'cargus')
    expect(env1.data).toHaveLength(500)
    expect(env1.meta.hasMore).toBe(true)
    const p2 = withPageSink({ page: 2, limit: 500 })
    const env2 = listPage(await list(p2), p2, 'cargus')
    expect(env2.data.map((w) => w.id)).toEqual(['501'])
    expect(env2.meta.hasMore).toBe(false)
  })

  it('a page past the end is empty', async () => {
    fakeCargus(5)
    expect(await list(parseListQuery({ page: '3', limit: '5' }))).toEqual([])
  })

  it('getWarehouse still finds a location beyond the first caller page', async () => {
    fakeCargus(120)
    const w = await new CargusAdapter().getWarehouse(CREDS, '117')
    expect(w.name).toBe('PL-117')
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with an exact hasMore', async () => {
    fakeCargus(7)
    const params = parseListQuery({ page: '2', limit: '3' })
    const env = listPage(await list(params), params, 'cargus')
    expect(env.data.map((w) => w.id)).toEqual(ids(4, 3))
    expect(env.meta.hasMore).toBe(true)
  })
})
