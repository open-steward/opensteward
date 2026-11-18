/**
 * Pepperi pagination: `page`/`page_size`, with `include_count=true` adding
 * the `X-Pepperi-Total-Records` / `X-Pepperi-Total-Pages` response headers —
 * https://developer.pepperi.com/first-steps/retrieving-data/. `hasMore` is
 * derived from the honestly-reported total, never guessed from a short page.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import { PepperiAdapter } from '../../../../../../src/verticals/ecommerce/adapters/pepperi/index'

const CREDS = { accessToken: 'tok_abc123', extra: { consumerKey: 'ck_xyz' } }

afterEach(() => vi.restoreAllMocks())

function itemsPage(total: number) {
  return async (_path: string, config: { params: Record<string, unknown> }) => {
    const page = Number(config.params['page'] ?? 1)
    const pageSize = Number(config.params['page_size'])
    const start = (page - 1) * pageSize
    const rows = Array.from({ length: Math.max(0, Math.min(pageSize, total - start)) }, (_, i) => ({
      InternalID: start + i + 1,
      ExternalID: `item-${start + i + 1}`,
      Name: `Item ${start + i + 1}`,
    }))
    return {
      data: rows,
      headers: { 'x-pepperi-total-records': String(total), 'x-pepperi-total-pages': String(Math.ceil(total / pageSize)) },
    }
  }
}

describe('Pepperi pagination', () => {
  it('reports hasMore: true while more rows remain, false on the last page', async () => {
    const get = vi.fn(itemsPage(120))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const adapter = new PepperiAdapter()

    const p1 = withPageSink({ page: 1, limit: 50 })
    const page1 = await adapter.listProducts(CREDS, p1)
    expect(page1).toHaveLength(50)
    expect(readUpstreamPage(p1)).toMatchObject({ totalCount: 120, hasMore: true })

    const p3 = withPageSink({ page: 3, limit: 50 })
    const page3 = await adapter.listProducts(CREDS, p3)
    expect(page3).toHaveLength(20)
    expect(readUpstreamPage(p3)).toMatchObject({ totalCount: 120, hasMore: false })
  })

  it('clamps limit to the documented page_size maximum (250)', async () => {
    const get = vi.fn(async (_path: string, _config: { params: Record<string, unknown> }) => ({
      data: [] as unknown[],
      headers: {} as Record<string, string>,
    }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const adapter = new PepperiAdapter()
    await adapter.listProducts(CREDS, { page: 1, limit: 5000 })
    const [, config] = get.mock.calls[0]!
    expect(config.params.page_size).toBe(250)
  })

  it('reports hasMore as unknown (not a guessed false) when the platform sends no count header', async () => {
    const get = vi.fn(async () => ({ data: [{ InternalID: 1 }], headers: {} }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const adapter = new PepperiAdapter()
    const params = withPageSink({ page: 1, limit: 50 })
    await adapter.listProducts(CREDS, params)
    expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
    expect(readUpstreamPage(params)?.totalCount).toBeUndefined()
  })
})
