/**
 * NOMS "Create Order" REST request shape — verified verbatim against
 * https://docs.nacelle.com/docs/noms-introduction:
 *
 *   POST https://noms.api.nacelle.com/api/v1/orders
 *   Authorization: Bearer <token>
 *   Content-Type: application/json
 *   X-Nacelle-Space-ID: <spaceId>
 *   { "order": { "source_reference_id", "source_name", "source_identifier",
 *                "line_items": [{ "source_reference_id", "quantity" }] } }
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios, { type AxiosInstance, type CreateAxiosDefaults } from 'axios'
import { NacelleAdapter } from '../../../../../../src/verticals/ecommerce/adapters/nacelle/index'
import { NOMS_CREATE_ORDER_URL } from '../../../../../../src/verticals/ecommerce/adapters/nacelle/constants'

const CREDS = { accessToken: 'pat_abcdef', extra: { spaceId: 'space_123' } }

afterEach(() => vi.restoreAllMocks())

describe('NacelleAdapter.createOrder', () => {
  it('POSTs the documented body shape to the documented NOMS endpoint with the documented headers', async () => {
    let capturedHeaders: Record<string, string> = {}
    const post = vi.fn(async (url: string, body: unknown) => ({
      data: { order: { id: 'noms_order_1', ...((body as { order: object }).order) } },
    }))
    vi.spyOn(axios, 'create').mockImplementation((cfg?: CreateAxiosDefaults) => {
      capturedHeaders = (cfg?.headers as Record<string, string>) ?? {}
      return { post } as unknown as AxiosInstance
    })

    const adapter = new NacelleAdapter()
    const order = await adapter.createOrder(CREDS, {
      id: 'os_order_42',
      lineItems: [
        {
          id: 'li_1',
          sku: 'WK-2026',
          title: 'Wireless Keyboard',
          quantity: 2,
          price: { amount: 4999, currency: 'USD' },
          metadata: {},
        },
      ],
    })

    expect(post).toHaveBeenCalledWith(
      NOMS_CREATE_ORDER_URL,
      {
        order: {
          source_reference_id: 'os_order_42',
          source_name: 'opensteward',
          source_identifier: 'os_order_42',
          line_items: [{ source_reference_id: 'WK-2026', quantity: 2 }],
        },
      },
    )
    expect(capturedHeaders['Authorization']).toBe('Bearer pat_abcdef')
    expect(capturedHeaders['X-Nacelle-Space-ID']).toBe('space_123')
    expect(capturedHeaders['Content-Type']).toBe('application/json')
    expect(order.id).toBe('noms_order_1')
  })

  it('falls back to variantId then productId when a line item has no sku', async () => {
    const post = vi.fn(async () => ({ data: {} }))
    vi.spyOn(axios, 'create').mockReturnValue({ post } as never)
    const adapter = new NacelleAdapter()
    await adapter.createOrder(CREDS, {
      id: 'os_order_43',
      lineItems: [
        {
          id: 'li_1',
          variantId: 'var_9',
          title: 'Some Product',
          quantity: 1,
          price: { amount: 1999, currency: 'USD' },
          metadata: {},
        },
      ],
    })
    expect(post).toHaveBeenCalledWith(
      NOMS_CREATE_ORDER_URL,
      expect.objectContaining({
        order: expect.objectContaining({
          line_items: [{ source_reference_id: 'var_9', quantity: 1 }],
        }),
      }),
    )
  })

  it('throws when neither id nor orderNumber is supplied', async () => {
    const adapter = new NacelleAdapter()
    await expect(adapter.createOrder(CREDS, { lineItems: [] })).rejects.toThrow(
      /id or orderNumber/,
    )
  })
})
