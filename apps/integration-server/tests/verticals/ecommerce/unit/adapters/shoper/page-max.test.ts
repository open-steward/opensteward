/**
 * Every Shoper list goes through `listWithPage`, which caps `limit` at 50.
 * Undeclared, the router asked for its default 100, got 50 back, and read the
 * full page as the last one: `meta.hasMore: false`, and a cache that stored
 * 50 rows as the whole collection. check:paging-contract cannot see this one
 * (the constructor needs a store URL its stubs lack), so it is pinned here.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { collectionIsComplete, listPage, parseListQuery } from '@opensteward/shared'
import { ShoperAdapter } from '../../../../../../src/verticals/ecommerce/adapters/shoper/index'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'https://example.test/callback',
  storeUrl: 'https://store.example.test',
}
const CREDS = { accessToken: 'tok', extra: { storeUrl: 'https://store.example.test' } }

afterEach(() => vi.restoreAllMocks())

describe('Shoper declares the page size its client caps at', () => {
  it('the router asks for 50 and a full page of 50 is not the last', async () => {
    const sent: Array<Record<string, unknown>> = []
    const get = vi.fn(async (_path: string, cfg?: { params?: Record<string, unknown> }) => {
      sent.push(cfg?.params ?? {})
      const limit = Number(cfg?.params?.['limit'])
      const list = Array.from({ length: limit }, (_, i) => ({ id: i + 1, name: `W${i + 1}` }))
      return { data: { count: 120, page: 1, pages: 3, list } }
    })
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)

    const adapter = new ShoperAdapter(CFG)
    const params = parseListQuery({}, adapter)
    expect(params.limit).toBe(50)
    const rows = await adapter.listLocations(CREDS, params)
    expect(sent[0]).toMatchObject({ limit: 50 })
    const env = listPage(rows, params, 'shoper')
    expect(env.meta.limit).toBe(50)
    expect(env.meta.hasMore).toBeNull()
    expect(collectionIsComplete(params, rows)).toBe(false)
  })
})
