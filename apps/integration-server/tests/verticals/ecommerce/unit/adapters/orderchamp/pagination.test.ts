/**
 * Cursor pagination wiring: page 2 must reuse page 1's endCursor, resolved
 * through the shared cursor pager, not re-fetch page 1 or drop `page`.
 * Docs: https://developers.orderchamp.com/manage-products (Paginating)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { _resetCursorPager } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'

const { post } = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('axios', () => ({
  default: { create: vi.fn(() => ({ post })) },
}))

import { OrderchampAdapter } from '../../../../../../src/verticals/ecommerce/adapters/orderchamp/index'

const CREDENTIALS: Credentials = { accessToken: 'tok_live_abc123' }

function ordersPage(nodes: Array<{ id: string }>, hasNextPage: boolean, endCursor: string | null) {
  return {
    data: {
      data: {
        orders: { edges: nodes.map((n) => ({ node: n })), pageInfo: { hasNextPage, endCursor } },
      },
    },
  }
}

describe('Orderchamp cursor pagination (listOrders)', () => {
  beforeEach(() => {
    post.mockReset()
    _resetCursorPager()
  })

  it('page 2 sends `after` equal to page 1s endCursor, not page 1 again', async () => {
    post
      .mockResolvedValueOnce(ordersPage([{ id: 'order-1' }], true, 'CURSOR_A'))
      .mockResolvedValueOnce(ordersPage([{ id: 'order-2' }], false, null))

    const adapter = new OrderchampAdapter()
    const page1 = await adapter.listOrders(CREDENTIALS, { page: 1, limit: 1 })
    const page2 = await adapter.listOrders(CREDENTIALS, { page: 2, limit: 1 })

    expect(page1.map((o: { id: string }) => o.id)).toEqual(['order-1'])
    expect(page2.map((o: { id: string }) => o.id)).toEqual(['order-2'])

    const [, page1Vars] = post.mock.calls[0]!
    const [, page2Vars] = post.mock.calls[1]!
    expect(page1Vars.variables.after).toBeUndefined()
    expect(page2Vars.variables.after).toBe('CURSOR_A')
  })

  it('clamps limit to MAX_PAGE_SIZE', async () => {
    post.mockResolvedValueOnce(ordersPage([], false, null))
    const adapter = new OrderchampAdapter()
    await adapter.listOrders(CREDENTIALS, { page: 1, limit: 5000 })
    const [, vars] = post.mock.calls[0]!
    expect(vars.variables.first).toBe(100)
  })
})
