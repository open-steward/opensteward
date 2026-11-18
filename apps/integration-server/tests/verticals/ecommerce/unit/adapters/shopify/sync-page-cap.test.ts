/**
 * A Shopify sync job failed on every collection it reached:
 *
 *   products / variants / collections:
 *     400 {"errors":"Limit exceeds maximum limit of 250"}
 *   inventory_levels:
 *     Error: listInventoryLevels requires `location_ids` or `inventory_item_ids`
 *   everything after: Circuit breaker opened during sync
 *
 * 500 is the sync worker's default page size. `listWithCursor` had a clamp to
 * 250 — and then spread the caller's params over it, so the clamp never
 * reached the wire on the first page. Same two-defect shape as HubSpot
 * (`crm/hubspot/pagination.test.ts`): fixing the clamp alone would turn the
 * loud 400 into a silent truncation, because the worker ends a collection on
 * a page shorter than the size it ASKED for. A 300-product store asked at 500
 * and answered at 250 would be marked complete at 250. So the adapter must
 * also declare `capabilities.maxPageSize`, which the worker uses for both the
 * request and the short-page test.
 *
 * inventory_levels: Shopify refuses an unfiltered list. The worker never
 * filters, so the adapter enumerates the shop's locations and asks per
 * location batch — which is also why `read_locations` has to be a
 * recommended scope for Shopify.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { ShopifyAdapter } from '../../../../../../src/verticals/ecommerce/adapters/shopify/index'
import { MAX_PAGE_SIZE } from '../../../../../../src/verticals/ecommerce/adapters/shopify/constants'
import { _resetCursorPager } from '@opensteward/shared'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/ecommerce/shopify/callback',
}
const CREDS = { accessToken: 'tok', extra: { shop: 'acme' } }

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

/** Stand in for the axios instance: answers by path, records what was asked. */
function fakeHttp(
  answer: (path: string, params: Record<string, unknown> | undefined) => unknown,
  calls: Call[] = [],
) {
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    calls.push({ path, params: cfg?.params })
    return { data: answer(path, cfg?.params), headers: {} }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { get, calls }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('page size against Shopify’s 250 ceiling', () => {
  it('declares the ceiling so the worker asks for it and ends collections on it', () => {
    const adapter = new ShopifyAdapter(CFG)
    expect(adapter.capabilities?.maxPageSize).toBe(MAX_PAGE_SIZE)
    expect(MAX_PAGE_SIZE).toBe(250)
  })

  it('never sends a limit above 250 on the first page, whatever the caller asked', async () => {
    const { calls } = fakeHttp(() => ({ products: [] }))
    await new ShopifyAdapter(CFG).listProducts(CREDS, { limit: 500 })
    expect(calls).toHaveLength(1)
    expect(calls[0].path).toBe('products.json')
    expect(calls[0].params?.limit).toBe(250)
  })

  it('nor on a cursor page', async () => {
    const { calls } = fakeHttp(() => ({ products: [] }))
    await new ShopifyAdapter(CFG).listProducts(CREDS, { limit: 500, cursor: 'abc' } as never)
    expect(calls[0].params).toEqual({ page_info: 'abc', limit: 250 })
  })

  it('passes a smaller limit through untouched', async () => {
    const { calls } = fakeHttp(() => ({
      collections: [],
      custom_collections: [],
      smart_collections: [],
    }))
    await new ShopifyAdapter(CFG).listProducts(CREDS, { limit: 25 })
    expect(calls[0].params?.limit).toBe(25)
  })
})

describe('inventory levels without a filter', () => {
  it('enumerates the shop’s locations and asks per location batch', async () => {
    const { calls } = fakeHttp((path, params) => {
      if (path === 'locations.json') return { locations: [{ id: 1 }, { id: 2 }] }
      if (path === 'inventory_levels.json') {
        expect(params?.location_ids).toBe('1,2')
        return {
          inventory_levels: [
            {
              inventory_item_id: 10,
              location_id: 1,
              available: 3,
              updated_at: '2026-09-12T00:00:00Z',
            },
            {
              inventory_item_id: 10,
              location_id: 2,
              available: 4,
              updated_at: '2026-09-12T00:00:00Z',
            },
          ],
        }
      }
      throw new Error('unexpected ' + path)
    })
    const levels = await new ShopifyAdapter(CFG).listInventoryLevels(CREDS, { limit: 250 })
    expect(levels).toHaveLength(2)
    expect(calls.map((c) => c.path)).toEqual(['locations.json', 'inventory_levels.json'])
    expect(calls[1].params?.limit).toBe(250)
  })

  it('batches location ids fifty at a time — Shopify’s cap on the filter — one batch per page', async () => {
    // One upstream request per worker page, so the batches are pages 1 and 2
    // rather than two requests inside page 1 (see cursor-paging.test.ts).
    const ids = Array.from({ length: 60 }, (_, i) => ({ id: i + 1 }))
    const { calls } = fakeHttp((path) =>
      path === 'locations.json' ? { locations: ids } : { inventory_levels: [] },
    )
    const adapter = new ShopifyAdapter(CFG)
    await adapter.listInventoryLevels(CREDS, { page: 1 })
    await adapter.listInventoryLevels(CREDS, { page: 2 })
    const batches = calls.filter((c) => c.path === 'inventory_levels.json')
    expect(batches).toHaveLength(2)
    expect(String(batches[0].params?.location_ids).split(',')).toHaveLength(50)
    expect(String(batches[1].params?.location_ids).split(',')).toHaveLength(10)
  })

  it('is empty, not an error, for a shop with no locations', async () => {
    const { calls } = fakeHttp(() => ({ locations: [] }))
    await expect(new ShopifyAdapter(CFG).listInventoryLevels(CREDS, {})).resolves.toEqual([])
    expect(calls.map((c) => c.path)).toEqual(['locations.json'])
  })

  it('still honours an explicit filter without touching locations', async () => {
    const { calls } = fakeHttp(() => ({ inventory_levels: [] }))
    await new ShopifyAdapter(CFG).listInventoryLevels(CREDS, {
      inventory_item_ids: '10,11',
    } as never)
    expect(calls.map((c) => c.path)).toEqual(['inventory_levels.json'])
    expect(calls[0].params?.inventory_item_ids).toBe('10,11')
  })
})
