/**
 * Deliveree listCarriers paging: `GET /vehicle_types` returns the whole list
 * of vehicle types for an area in one response, so the adapter slices the
 * caller's page locally.
 *
 * First-party docs: https://developers.deliveree.com/
 *
 *   "Get Vehicle Types / We return a list vehicle types of a specific area."
 *   Parameters: `pickup_location` (object) only. The 200 response is
 *   `{ "data": [ ... ] }` with no `pagination` block, unlike `GET /deliveries`,
 *   whose documented response carries `pagination.per_page`.
 *
 * So there is no page or per_page to send. Before this fix the router cut the
 * response to `limit`, page 2 repeated page 1, and vehicle types past the
 * first page could never be reached.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { DelivereeAdapter } from '../../../../../../src/verticals/logistics/adapters/deliveree/index'

const CREDS = { accessToken: 'dlvr_test' }
const CALL_BUDGET = 20
const L = 5
const N = 2 * L + 1

/** The only documented query parameter of GET /vehicle_types. */
const VEHICLE_TYPE_PARAMS = ['pickup_location']

/**
 * A fake Deliveree that honours ONLY the documented request for
 * `GET /vehicle_types`: no query parameter but `pickup_location`. It returns
 * every vehicle type, as the real endpoint does.
 */
function fakeDeliveree(total: number) {
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    if (path !== 'vehicle_types') throw new Error(`unexpected path ${path}`)
    const bad = Object.entries(cfg?.params ?? {})
      .filter(([, v]) => v !== undefined)
      .map(([k]) => k)
      .filter((k) => !VEHICLE_TYPE_PARAMS.includes(k))
    if (bad.length) throw new Error(`400: undocumented query params ${bad.join(',')}`)
    return {
      data: {
        data: Array.from({ length: total }, (_, i) => ({
          id: i + 1,
          name: `Vehicle ${i + 1}`,
          cargo_weight: 1000,
        })),
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  return { get }
}

const ids = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => String(from + i))

afterEach(() => vi.restoreAllMocks())

describe('deliveree listCarriers paging', () => {
  const adapter = () => new DelivereeAdapter()

  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeDeliveree(N)
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
    expect(seen).toEqual(ids(1, N))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request is the documented unpaged GET, with no invented paging key', async () => {
    const { get } = fakeDeliveree(N)
    await adapter().listCarriers(CREDS, withPageSink({ page: 2, limit: L }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe('vehicle_types')
    const sent = (get.mock.calls[0]![1] as { params?: Record<string, unknown> } | undefined)?.params
    expect(sent?.page).toBeUndefined()
    expect(sent?.per_page).toBeUndefined()
  })

  it('a limit above the router maximum is clamped, and serves every row with hasMore false', async () => {
    fakeDeliveree(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBeLessThan(100000)
    const rows = await adapter().listCarriers(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(ids(1, N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with exact meta', async () => {
    fakeDeliveree(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter().listCarriers(CREDS, params), params, 'deliveree')
    expect(env.data.map((r) => r.id)).toEqual(ids(L + 1, L))
    expect(env.meta).toEqual(
      expect.objectContaining({ page: 2, limit: L, totalCount: N, hasMore: true }),
    )
  })
})
