/**
 * Ordergroove pagination: cursor-based, `{ count, next, previous, results }`
 * envelope, `next`/`previous` full URLs carrying the opaque `cursor` query
 * param — https://developer.ordergroove.com/reference/pagination.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, _resetCursorPager } from '@opensteward/shared'
import { OrdergrooveAdapter } from '../../../../../../src/verticals/ecommerce/adapters/ordergroove/index'

const CREDS = { accessToken: 'ogk_live_abc123' }

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

function page(total: number) {
  return async (_path: string, config: { params: Record<string, unknown> }) => {
    const cursor = config.params['cursor'] != null ? Number(config.params['cursor']) : 0
    const pageSize = Number(config.params['page_size'])
    const rows = Array.from({ length: Math.max(0, Math.min(pageSize, total - cursor)) }, (_, i) => ({
      external_product_id: String(cursor + i + 1),
      name: `Product ${cursor + i + 1}`,
    }))
    const nextOffset = cursor + rows.length
    const next = nextOffset < total ? `https://restapi.ordergroove.com/products/?cursor=${nextOffset}` : null
    return { data: { count: total, next, previous: null, results: rows } }
  }
}

describe('Ordergroove pagination', () => {
  it('reports hasMore while a next URL is present, false on the last page', async () => {
    const get = vi.fn(page(120))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const adapter = new OrdergrooveAdapter()

    const p1 = withPageSink({ limit: 50 })
    const page1 = await adapter.listProducts(CREDS, p1)
    expect(page1).toHaveLength(50)
    expect(readUpstreamPage(p1)).toMatchObject({ hasMore: true })

    // Page 3 of 50 is rows 101..120: the walk follows page 1's and page 2's cursors.
    const p3 = withPageSink({ page: 3, limit: 50 })
    const page3 = await adapter.listProducts(CREDS, p3)
    expect(page3).toHaveLength(20)
    expect(readUpstreamPage(p3)).toMatchObject({ hasMore: false })
  })

  it('clamps limit to the documented page_size maximum (100)', async () => {
    const get = vi.fn(async (_path: string, _config: { params: Record<string, unknown> }) => ({
      data: { results: [] as unknown[] },
    }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const adapter = new OrdergrooveAdapter()
    await adapter.listProducts(CREDS, { limit: 500 })
    const [, config] = get.mock.calls[0]!
    expect(config.params.page_size).toBe(100)
  })

  it('extracts the cursor query param from the next URL, not the whole URL', async () => {
    const get = vi.fn(async () => ({
      data: {
        count: 2,
        next: 'https://restapi.ordergroove.com/products/?page_size=1&cursor=abc123',
        previous: null,
        results: [{ external_product_id: '1', name: 'One' }],
      },
    }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const adapter = new OrdergrooveAdapter()
    const params = withPageSink({ limit: 1 })
    await adapter.listProducts(CREDS, params)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })
})
