import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { ShipBobAdapter } from '../../../../../../src/verticals/logistics/adapters/shipbob/index'
import type { Credentials } from '../../../../../../src/verticals/logistics/adapter/interface'

/**
 * `shipbob_channel_id` was set as a DEFAULT header on the axios instance, so
 * it rode along on every request including reads. It does not merely identify
 * the caller: on a read it FILTERS the response to that channel.
 *
 * Measured against a live sandbox token, same endpoint, same moment:
 *
 *   GET /2026-01/order  with shipbob_channel_id=239467  ->  200, 0 orders
 *   GET /2026-01/order  with no channel header          ->  200, 25 orders
 *
 * ShipBob mints one channel per authorized application, so our channel owns
 * only the records our application created — nothing on a merchant's existing
 * account. Sending it on reads hides every order the merchant actually has.
 * Carriers and warehouses are account-level and were unaffected, which is what
 * made the loss look partial and arbitrary.
 *
 * The app's own ShipBob registration has Multi-channel enabled — "fetch
 * ShipBob user data, regardless of channel and source" — which is precisely
 * what a channel header overrides. Sending it defeated the setting the app is
 * configured with.
 *
 * The header belongs on the calls that attribute a NEW record to a channel:
 * order creation and the fulfilment-cost estimate, which ShipBob documents as
 * requiring it.
 *
 * Cancel and modify are deliberately left without it. ShipBob requires the
 * header there to match the channel that CREATED the record, which for an
 * order the merchant placed elsewhere is not ours — sending ours would turn a
 * working call into a 403.
 */

const CREDS: Credentials = { accessToken: 'tok', extra: { channelId: '239467' } }

function stubAxios() {
  const get = vi.fn().mockResolvedValue({ data: [] })
  const post = vi.fn().mockResolvedValue({ data: { estimates: [] } })
  const create = vi
    .spyOn(axios, 'create')
    .mockReturnValue({ get, post, delete: vi.fn() } as never)
  return { get, post, create }
}

/** The headers the client puts on the axios instance itself. */
function defaultHeaders(create: ReturnType<typeof stubAxios>['create']) {
  return (create.mock.calls[0]?.[0] as { headers: Record<string, string> }).headers
}

/** The per-request config of the Nth post. */
function postHeaders(post: ReturnType<typeof stubAxios>['post'], n = 0) {
  return (post.mock.calls[n]?.[2] as { headers?: Record<string, string> } | undefined)?.headers
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the shipbob_channel_id header', () => {
  it('is not a default header on the client', async () => {
    const { create } = stubAxios()
    await new ShipBobAdapter().listOrders(CREDS, {})
    expect(defaultHeaders(create)).not.toHaveProperty('shipbob_channel_id')
  })

  it('is absent when listing orders, so every channel stays visible', async () => {
    const { get, create } = stubAxios()
    await new ShipBobAdapter().listOrders(CREDS, {})
    const perRequest = (get.mock.calls[0]?.[1] as { headers?: Record<string, string> })?.headers
    expect(perRequest?.['shipbob_channel_id']).toBeUndefined()
    expect(defaultHeaders(create)).not.toHaveProperty('shipbob_channel_id')
  })

  it('is absent when listing warehouses', async () => {
    const { create } = stubAxios()
    await new ShipBobAdapter().listWarehouses(CREDS, {})
    expect(defaultHeaders(create)).not.toHaveProperty('shipbob_channel_id')
  })

  it('is sent when creating an order, which attributes it to our channel', async () => {
    const { post } = stubAxios()
    await new ShipBobAdapter().createOrder(CREDS, { orderNumber: 'SO-1' })
    expect(postHeaders(post)).toMatchObject({ shipbob_channel_id: '239467' })
  })

  it('is sent on order:estimate, which ShipBob requires it for', async () => {
    const { post } = stubAxios()
    await new ShipBobAdapter().getRates(CREDS, {
      destinationAddress: { country: 'US' },
      products: [{ reference_id: 'TShirtBlueM', quantity: 1 }],
    } as never)
    expect(postHeaders(post)).toMatchObject({ shipbob_channel_id: '239467' })
  })

  it('is not sent on cancel, where ours is the wrong channel', async () => {
    const { post } = stubAxios()
    await new ShipBobAdapter().cancelOrder(CREDS, '1001')
    expect(postHeaders(post)?.['shipbob_channel_id']).toBeUndefined()
  })

  it('is omitted entirely when the connection has no channel', async () => {
    const { post } = stubAxios()
    await new ShipBobAdapter().createOrder({ accessToken: 'tok' }, { orderNumber: 'SO-1' })
    expect(postHeaders(post)?.['shipbob_channel_id']).toBeUndefined()
  })
})
