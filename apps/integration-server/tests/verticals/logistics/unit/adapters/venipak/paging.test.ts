/**
 * Venipak listWarehouses paging: `GET ws/get_pickup_points` returns every
 * terminal and locker in one JSON array, so the adapter slices the caller's page
 * locally.
 *
 * Venipak publishes no API reference page; the first-party evidence is Venipak's
 * own e-shop module (github.com/venipak), whose only call to this endpoint sends
 * filters and nothing else:
 * https://github.com/venipak/Venipak-Prestashop-1.6-1.7.7-8/blob/main/classes/MjvpApi.php
 *
 *   $queryParams['country'] = $country_code; ... $queryParams['postcode'] = ...;
 *   ... $queryParams['city'] = $city; ... $queryParams['pickup_enabled'] = 1;
 *   return $this->executeRequest('ws/get_pickup_points', 'GET', array('queryParams' => $queryParams));
 *
 * and the live endpoint (https://go.venipak.lt/ws/get_pickup_points) answers a
 * bare array of 1,218 rows whether or not `page`/`limit` are sent. There is no
 * page, offset, cursor or next signal, so page 2 of the caller must come from the
 * same request as page 1. Before this fix page 2 repeated page 1.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { VenipakAdapter } from '../../../../../../src/verticals/logistics/adapters/venipak/index'

const CREDS = { accessToken: 'user', extra: { password: 'pw' } }
const CALL_BUDGET = 20
const L = 5
const N = 2 * L + 1
const DOCUMENTED_QUERY = ['user', 'pass', 'country', 'postcode', 'city', 'pickup_enabled']

/**
 * A fake Venipak that honours ONLY the documented request: `GET ws/get_pickup_points`
 * with auth and filter params. It returns every row, as the real endpoint does.
 */
function fakeVenipak(total: number) {
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    if (path !== 'ws/get_pickup_points') throw new Error(`unexpected path ${path}`)
    const bad = Object.entries(cfg?.params ?? {})
      .filter(([, v]) => v !== undefined)
      .map(([k]) => k)
      .filter((k) => !DOCUMENTED_QUERY.includes(k))
    if (bad.length) throw new Error(`400: undocumented query params ${bad.join(',')}`)
    return {
      data: Array.from({ length: total }, (_, i) => ({
        id: i + 1,
        name: `Locker ${i + 1}`,
        code: `C${i + 1}`,
        country: 'LT',
      })),
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  return { get }
}

const ids = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => String(from + i))

afterEach(() => vi.restoreAllMocks())

describe('venipak listWarehouses paging', () => {
  const adapter = () => new VenipakAdapter()

  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeVenipak(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await adapter().listWarehouses(CREDS, params)
      seen.push(...rows.map((r) => r.id as string))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ totalCount: N, pagedLocally: true }),
      )
    }
    expect(seen).toEqual(ids(1, N))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request is the documented unpaged GET, with no invented paging key', async () => {
    const { get } = fakeVenipak(N)
    await adapter().listWarehouses(CREDS, withPageSink({ page: 2, limit: L, country: 'LT' }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe('ws/get_pickup_points')
    const sent = Object.keys(get.mock.calls[0]![1]?.params ?? {}).sort()
    expect(sent).toEqual(['country', 'pass', 'user'])
  })

  it('a limit above the router maximum is clamped, and serves every row with hasMore false', async () => {
    fakeVenipak(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBeLessThan(100000)
    const rows = await adapter().listWarehouses(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(ids(1, N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with exact meta', async () => {
    fakeVenipak(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter().listWarehouses(CREDS, params), params, 'venipak')
    expect(env.data.map((r) => r.id)).toEqual(ids(L + 1, L))
    expect(env.meta).toEqual(
      expect.objectContaining({ page: 2, limit: L, totalCount: N, hasMore: true }),
    )
  })

  it('getWarehouse still finds a row past the first caller page', async () => {
    fakeVenipak(N)
    const w = await adapter().getWarehouse(CREDS, String(N))
    expect(w.id).toBe(String(N))
  })
})
