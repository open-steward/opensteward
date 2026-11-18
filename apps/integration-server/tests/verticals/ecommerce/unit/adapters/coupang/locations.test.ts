/**
 * Coupang lists shipping locations at GET /v2/providers/marketplace_openapi/
 * apis/api/v2/vendor/shipping-place/outbound: "To query the list of all
 * shipping locations registered: Input pageNum and pageSize only", pageNum
 * "Min = 1, Max: Value of totalPages returned", pageSize "Default=10, Max=50",
 * and the response is `{ content[], pagination{currentPage, totalPages,
 * totalElements, countPerPage} }`
 * (https://developers.coupang.com/en/api/logistics/query-a-shipping-location).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { _resetCursorPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { CoupangAdapter } from '../../../../../../src/verticals/ecommerce/adapters/coupang/index'
import { LocationSchema } from '../../../../../../src/verticals/ecommerce/schema/location'
import { CREDS, fakeCoupang } from './fake'
import { shippingPlaceExample } from './fixtures'

const PATH = '/v2/providers/marketplace_openapi/apis/api/v2/vendor/shipping-place/outbound'

function places(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    ...shippingPlaceExample(),
    outboundShippingPlaceCode: 5000 + i,
    shippingPlaceName: `place ${i}`,
  }))
}

function fake(n: number) {
  const all = places(n)
  return fakeCoupang([
    [
      /^\/v2\/providers\/marketplace_openapi\/apis\/api\/v2\/vendor\/shipping-place\/outbound$/,
      (params) => {
        for (const k of Object.keys(params)) {
          if (!['pageNum', 'pageSize', 'placeCodes', 'placeNames'].includes(k))
            throw new Error(`undocumented parameter ${k}`)
        }
        if (params['placeCodes'] !== undefined) {
          const found = all.filter(
            (p) => String(p.outboundShippingPlaceCode) === String(params['placeCodes']),
          )
          return {
            content: found,
            pagination: {
              currentPage: 1,
              totalPages: 1,
              totalElements: found.length,
              countPerPage: 10,
            },
          }
        }
        if (params['pageNum'] === undefined)
          throw new Error(
            '(pageNum & pageSize) or placeCodes or placeNames must be provided to call this API',
          )
        const size = params['pageSize'] === undefined ? 10 : Number(params['pageSize'])
        if (size > 50) throw new Error('pageSize Max=50')
        const pageNum = Number(params['pageNum'])
        const totalPages = Math.ceil(all.length / size)
        return {
          content: all.slice((pageNum - 1) * size, pageNum * size),
          pagination: {
            currentPage: pageNum,
            totalPages,
            totalElements: all.length,
            countPerPage: size,
          },
        }
      },
    ],
  ])
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

describe('Coupang listLocations', () => {
  it('pages 2L+1 locations by pageNum/pageSize, each once, hasMore exact', async () => {
    const calls = fake(7)
    const adapter = new CoupangAdapter()
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 3 })
      const rows = await adapter.listLocations(CREDS, params)
      for (const r of rows) LocationSchema.parse(r)
      ids.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(7)
    }
    expect(ids).toEqual(places(7).map((p) => String(p.outboundShippingPlaceCode)))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.params)).toEqual([
      { pageNum: 1, pageSize: 3 },
      { pageNum: 2, pageSize: 3 },
      { pageNum: 3, pageSize: 3 },
    ])
    expect(calls.every((c) => c.path === PATH)).toBe(true)
  })

  it('clamps a limit above 50 and reports the size it sent', async () => {
    const calls = fake(60)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await new CoupangAdapter().listLocations(CREDS, params)
    expect(rows).toHaveLength(50)
    expect(calls[0]!.params).toEqual({ pageNum: 1, pageSize: 50 })
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: 50, totalCount: 60 })
  })
})

describe('Coupang getLocation', () => {
  it('queries one location by placeCodes', async () => {
    const calls = fake(7)
    const loc = await new CoupangAdapter().getLocation(CREDS, '5003')
    expect(loc.name).toBe('place 3')
    expect(calls.map((c) => c.params)).toEqual([{ placeCodes: '5003' }])
  })

  it('is a 404 for a code that is not registered', async () => {
    fake(7)
    await expect(new CoupangAdapter().getLocation(CREDS, '1')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})
