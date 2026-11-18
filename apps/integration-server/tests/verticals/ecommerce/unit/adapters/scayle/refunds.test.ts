/**
 * SCAYLE refunds: the Admin API documents no way to read cancellations.
 *
 * The only cancellation operation is `POST /fulfillment/cancellations`
 * (https://scayle.dev/open_api_specs/admin-api-latest/fulfillment_cancellations_post.json:
 * "This endpoint can be used to send a cancellation."). The Fulfilment
 * resource lists only "Create a new shipment", "Return items" and "Send a
 * cancellation"; there is no GET for cancellations or refunds at any path.
 * listRefunds and getRefund therefore refuse with 501 before any request.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { ScayleAdapter } from '../../../../../../src/verticals/ecommerce/adapters/scayle/index'

const CREDS: Credentials = {
  accessToken: 'scayle-key',
  extra: { tenantSpace: 'acme-live', shopKey: 'shop-1', countryCode: 'DE' },
}

function fake() {
  const get = vi.fn(async () => ({ data: { entities: [{ id: 1 }], cursor: { next: null } } }))
  const create = vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
  return { get, create }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SCAYLE refunds are not readable through the Admin API', () => {
  it('listRefunds throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { get } = fake()
    const err = await new ScayleAdapter()
      .listRefunds(CREDS, { page: 1, limit: 10 })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect((err as Error).message).toMatch(/SCAYLE cannot list refunds/)
    expect(get).not.toHaveBeenCalled()
  })

  it('getRefund throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { get } = fake()
    const err = await new ScayleAdapter().getRefund(CREDS, '123').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect((err as Error).message).toMatch(/SCAYLE cannot read refunds/)
    expect(get).not.toHaveBeenCalled()
  })
})
