/**
 * Cursor pagination wiring: the sync worker's numeric `page` must resolve
 * through the shared cursor pager, so page 2 of a list reuses page 1's
 * `endCursor` as `after` rather than re-fetching page 1 or dropping `page`
 * entirely. Docs: https://api.marketplacer.com/docs/seller-api/examples/utility/howto_paginate/
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { _resetCursorPager } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'

const { post } = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('axios', () => ({
  default: { create: vi.fn(() => ({ post })) },
}))

import { MarketplacerAdapter } from '../../../../../../src/verticals/ecommerce/adapters/marketplacer/index'

const CREDENTIALS: Credentials = {
  accessToken: 'sk_live_abc123',
  extra: { instanceHost: 'https://bestfriendbazaar.com', apiKey: 'sk_live_abc123', currency: 'AUD' },
}

function invoicesPage(nodes: Array<{ id: string }>, hasNextPage: boolean, endCursor: string | null) {
  return { data: { data: { invoices: { totalCount: 100, pageInfo: { hasNextPage, endCursor }, nodes } } } }
}

describe('Marketplacer cursor pagination (listOrders)', () => {
  beforeEach(() => {
    post.mockReset()
    _resetCursorPager()
  })

  it('page 2 sends `after` equal to page 1s endCursor, not page 1 again', async () => {
    post
      .mockResolvedValueOnce(invoicesPage([{ id: 'inv-1' }], true, 'CURSOR_A'))
      .mockResolvedValueOnce(invoicesPage([{ id: 'inv-2' }], false, null))

    const adapter = new MarketplacerAdapter()
    const page1 = await adapter.listOrders(CREDENTIALS, { page: 1, limit: 1 })
    const page2 = await adapter.listOrders(CREDENTIALS, { page: 2, limit: 1 })

    expect(page1.map((o: { id: string }) => o.id)).toEqual(['inv-1'])
    expect(page2.map((o: { id: string }) => o.id)).toEqual(['inv-2'])

    const [, page1Vars] = post.mock.calls[0]!
    const [, page2Vars] = post.mock.calls[1]!
    expect(page1Vars.variables.after).toBeUndefined()
    expect(page2Vars.variables.after).toBe('CURSOR_A')
  })

  it('clamps limit to the documented invoices ceiling (100)', async () => {
    post.mockResolvedValueOnce(invoicesPage([], false, null))
    const adapter = new MarketplacerAdapter()
    await adapter.listOrders(CREDENTIALS, { page: 1, limit: 5000 })
    const [, vars] = post.mock.calls[0]!
    expect(vars.variables.first).toBe(100)
  })
})
