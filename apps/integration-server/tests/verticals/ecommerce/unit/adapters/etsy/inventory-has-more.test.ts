/**
 * Etsy has no bulk inventory endpoint, so listInventoryLevels lists at most 25
 * active listings and flattens each one's products into levels. The number of
 * levels says nothing about the end of the collection: 25 listings can make
 * 40 levels, a short page against the router's default limit of 100, while
 * hundreds of listings remain. That short page read as the last one —
 * `meta.hasMore: false`, and a cache that stored those levels as all of them.
 * Etsy's own listing `count` is what says whether more remain.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  collectionIsComplete,
  listPage,
  parseListQuery,
  readUpstreamPage,
} from '@opensteward/shared'
import { EtsyAdapter } from '../../../../../../src/verticals/ecommerce/adapters/etsy/index'

const CREDS = { accessToken: 'tok', extra: { apiKeyString: 'key123', shopId: 'shop1' } }

/** `count` active listings, each with two inventory products. */
function fakeEtsy(count: number) {
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (path.endsWith('/inventory')) {
      return {
        data: {
          products: [
            { product_id: 1, sku: 'a', offerings: [{ quantity: 1 }] },
            { product_id: 2, sku: 'b', offerings: [{ quantity: 2 }] },
          ],
        },
      }
    }
    const limit = Number(cfg?.params?.['limit'])
    const results = Array.from({ length: Math.min(limit, count) }, (_, i) => ({
      listing_id: i + 1,
    }))
    return { data: { count, results } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
}

afterEach(() => vi.restoreAllMocks())

describe('Etsy listInventoryLevels reports whether listings remain', () => {
  it('a short page of levels is not the end while listings remain', async () => {
    fakeEtsy(300)
    const params = parseListQuery({ limit: '20' })
    const rows = await new EtsyAdapter().listInventoryLevels(CREDS, params)
    expect(rows).toHaveLength(20)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(listPage(rows, params, 'etsy').meta.hasMore).toBe(true)

    const first = parseListQuery({})
    const levels = await new EtsyAdapter().listInventoryLevels(CREDS, first)
    expect(levels).toHaveLength(100)
    expect(collectionIsComplete(first, levels)).toBe(false)
  })

  it('every listing fetched is the end', async () => {
    fakeEtsy(3)
    const params = parseListQuery({})
    const rows = await new EtsyAdapter().listInventoryLevels(CREDS, params)
    expect(rows).toHaveLength(6)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(collectionIsComplete(params, rows)).toBe(true)
  })
})
