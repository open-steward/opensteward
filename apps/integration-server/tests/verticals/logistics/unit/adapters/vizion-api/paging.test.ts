/**
 * Vizion `listCarriers` (GET /carriers) is not paginated. The first-party
 * reference (https://docs.vizionapi.com/reference/carrier_list) defines the
 * operation with no parameters at all and says: "Get all carriers. Returns all
 * supported carriers, and the corresponding `carrier_code` and `scac`
 * (**deprecated**) values." The 200 response is a bare array. So one response
 * is the whole collection and the adapter pages it locally. Before this, every
 * caller page returned every carrier: page 2 repeated page 1 and a sync never
 * saw an end.
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
import { VizionApiAdapter } from '../../../../../../src/verticals/logistics/adapters/vizion-api/index'

const CREDS = { accessToken: 'vizion_test' }
const CALL_BUDGET = 20

function carriers(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    name: `Carrier ${i + 1}`,
    scac: `SC${i + 1}`,
    carrier_code: `C${i + 1}`,
  }))
}

/**
 * A fake Vizion that honours ONLY what the docs define for GET /carriers:
 * no query parameters, a bare array of every carrier.
 */
function fakeVizion(total: number) {
  const all = carriers(total)
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
    if (path !== '/carriers') throw new Error(`unexpected path ${path}`)
    const params = cfg?.params ?? {}
    const extra = Object.keys(params).filter((k) => params[k] !== undefined)
    if (extra.length > 0) throw new Error(`undocumented params sent: ${extra.join(',')}`)
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

function codes(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `C${start + i}`)
}

const list = (p: QueryParams) => new VizionApiAdapter().listCarriers(CREDS, p)
const idOf = (c: { id?: string }) => c.id

afterEach(() => vi.restoreAllMocks())

describe('vizion-api listCarriers paging (unpaginated GET /carriers, paged locally)', () => {
  it('with 2L+1 rows, pages 1..3 at limit L return every carrier once, in order, hasMore exact', async () => {
    const L = 4
    fakeVizion(2 * L + 1)
    const seen: (string | undefined)[] = []
    const hasMore: boolean[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await list(params), params, 'vizion-api')
      seen.push(...env.data.map(idOf))
      hasMore.push(env.meta.hasMore as boolean)
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ pagedLocally: true, totalCount: 2 * L + 1 }),
      )
    }
    expect(seen).toEqual(codes(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 returns the second slice, and the request is the documented bare call', async () => {
    const { get } = fakeVizion(10)
    const page1 = (await list(parseListQuery({ page: '1', limit: '3' }))).map(idOf)
    const page2 = (await list(parseListQuery({ page: '2', limit: '3' }))).map(idOf)
    expect(page1).toEqual(codes(1, 3))
    expect(page2).toEqual(codes(4, 3))
    // No paging key exists upstream; the page-2 request carries no params.
    const page2Params = (get.mock.calls[1]?.[1]?.params ?? {}) as Record<string, unknown>
    expect(Object.keys(page2Params).filter((k) => page2Params[k] !== undefined)).toEqual([])
  })

  it('a large limit is not clamped below the collection', async () => {
    fakeVizion(150)
    const params = withPageSink({ page: 1, limit: 500 })
    const env = listPage(await list(params), params, 'vizion-api')
    expect(env.data.map(idOf)).toEqual(codes(1, 150))
    expect(env.meta.hasMore).toBe(false)
  })

  it('a page past the end is empty', async () => {
    fakeVizion(5)
    expect(await list(parseListQuery({ page: '3', limit: '5' }))).toEqual([])
  })

  it('getCarrier still searches the whole collection', async () => {
    fakeVizion(30)
    const c = await new VizionApiAdapter().getCarrier(CREDS, 'C27')
    expect(c.id).toBe('C27')
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with an exact hasMore', async () => {
    fakeVizion(7)
    const params = parseListQuery({ page: '2', limit: '3' })
    const env = listPage(await list(params), params, 'vizion-api')
    expect(env.data.map(idOf)).toEqual(codes(4, 3))
    expect(env.meta.hasMore).toBe(true)
  })
})
