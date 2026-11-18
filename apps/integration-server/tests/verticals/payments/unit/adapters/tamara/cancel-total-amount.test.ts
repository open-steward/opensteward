import { describe, it, expect, vi, afterEach } from 'vitest'
import { TamaraAdapter } from '../../../../../../src/verticals/payments/adapters/tamara'
import { TamaraClient } from '../../../../../../src/verticals/payments/adapters/tamara/client'
import type { Credentials } from '@opensteward/shared'

/**
 * `cancelCharge` POSTed a literal `{}` to `/orders/{id}/cancel`. Tamara
 * requires `total_amount: {amount, currency}` on that request
 * (https://docs.tamara.co/reference/cancelorder), so the call was rejected
 * rather than cancelling anything — and the method still re-read the order and
 * returned a Charge afterwards, so a caller saw a plausible uncancelled order
 * back instead of an error.
 *
 * The amount is not the caller's to supply: `cancelCharge` takes only an id,
 * and cancelling a different total than the order holds is exactly the kind of
 * mistake the vendor requires the field to prevent. So it is read from the
 * order itself, which the method already fetched — just afterwards.
 */

const CREDS = { accessToken: 'tok' } as Credentials

function stubClient(order: Record<string, unknown>) {
  const post = vi.spyOn(TamaraClient.prototype, 'post').mockResolvedValue({} as never)
  const get = vi
    .spyOn(TamaraClient.prototype, 'get')
    .mockResolvedValue(order as never)
  return { post, get }
}

afterEach(() => vi.restoreAllMocks())

describe('tamara cancelCharge', () => {
  it('sends the order total_amount Tamara requires', async () => {
    const { post } = stubClient({
      order_id: 'ord_1',
      status: 'canceled',
      total_amount: { amount: '199.99', currency: 'SAR' },
    })

    await new TamaraAdapter().cancelCharge(CREDS, 'ord_1')

    const [path, body] = post.mock.calls[0] ?? []
    expect(path).toBe('/orders/ord_1/cancel')
    expect(body).toEqual({ total_amount: { amount: '199.99', currency: 'SAR' } })
  })

  it('reads the total before cancelling, not after', async () => {
    // The order's state changes on cancel, so reading the total afterwards is
    // not a substitute — the read has to precede the write.
    const calls: string[] = []
    vi.spyOn(TamaraClient.prototype, 'get').mockImplementation(async (p: string) => {
      calls.push(`GET ${p}`)
      return { order_id: 'ord_1', total_amount: { amount: '10.00', currency: 'AED' } } as never
    })
    vi.spyOn(TamaraClient.prototype, 'post').mockImplementation(async (p: string) => {
      calls.push(`POST ${p}`)
      return {} as never
    })

    await new TamaraAdapter().cancelCharge(CREDS, 'ord_1')

    expect(calls[0]).toBe('GET /orders/ord_1')
    expect(calls[1]).toBe('POST /orders/ord_1/cancel')
  })

  it('refuses to cancel when the order reports no total', async () => {
    // Sending `{}` is what this fixes; falling back to it on a missing total
    // would reintroduce the same silent rejection.
    stubClient({ order_id: 'ord_1' })
    await expect(new TamaraAdapter().cancelCharge(CREDS, 'ord_1')).rejects.toThrow(/total/i)
  })

  it('still returns the order state after cancelling', async () => {
    stubClient({
      order_id: 'ord_1',
      status: 'canceled',
      total_amount: { amount: '199.99', currency: 'SAR' },
    })
    const charge = await new TamaraAdapter().cancelCharge(CREDS, 'ord_1')
    expect(charge.id).toBe('ord_1')
    expect(charge.status).toBe('cancelled')
  })
})
