/**
 * Amazon Shipping v2 labels: refused, before any request.
 *
 * First-party spec (Amazon's own model repository):
 * https://github.com/amzn/selling-partner-api-models/blob/main/models/shipping-api-model/shippingV2.json
 *
 * The model's only label read is getShipmentDocuments
 * (GET /shipping/v2/shipments/{shipmentId}/documents): "Returns the shipping
 * documents associated with a package in a shipment." Its query parameter
 * `packageClientReferenceId` is `"required": true` ("The package client
 * reference identifier originally provided in the request body parameter for
 * the getRates operation."). No operation in the model lists shipments or
 * labels, so there is no collection to page, and a shipment id alone cannot
 * address a label.
 *
 * Before this change listLabels answered [] without a request (the sync took
 * that as an empty collection), and getLabel sent GET shipments/{id}/label, a
 * path the model does not have.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import { AmazonShippingAdapter } from '../../../../../../src/verticals/logistics/adapters/amazon-shipping/index'

// An expired token with everything a refresh needs: if a method reached
// ensureAuth it would POST to the LWA token URL through global fetch (auth.ts),
// and the counter below would see it.
const CREDS = {
  accessToken: 'Atza|test',
  refreshToken: 'Atzr|test',
  expiresAt: new Date(0),
  extra: { clientId: 'amzn1.application-oa2-client.test', clientSecret: 'secret' },
}

function recordRequests() {
  const http = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
  const create = vi.spyOn(axios, 'create').mockReturnValue(http as never)
  const post = vi.spyOn(axios, 'post').mockRejectedValue(new Error('network: token refresh'))
  const request = vi.spyOn(axios, 'request').mockRejectedValue(new Error('network'))
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network: fetch'))
  return () =>
    fetchSpy.mock.calls.length +
    create.mock.calls.length +
    post.mock.calls.length +
    request.mock.calls.length +
    http.get.mock.calls.length +
    http.post.mock.calls.length +
    http.put.mock.calls.length +
    http.delete.mock.calls.length
}

afterEach(() => vi.restoreAllMocks())

describe('amazon-shipping labels', () => {
  it('listLabels throws 501 NOT_SUPPORTED and sends no request', async () => {
    const sent = recordRequests()
    const params = withPageSink({ page: 1, limit: 10 })
    await expect(new AmazonShippingAdapter().listLabels(CREDS, params)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining('Amazon Shipping cannot list labels'),
    })
    expect(sent()).toBe(0)
  })

  it('listLabels refuses on every page, not only page 1', async () => {
    const sent = recordRequests()
    for (const page of [1, 2, 3]) {
      await expect(
        new AmazonShippingAdapter().listLabels(CREDS, withPageSink({ page, limit: 7 })),
      ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    }
    expect(sent()).toBe(0)
  })

  it('getLabel throws 501 NOT_SUPPORTED naming packageClientReferenceId, and sends no request', async () => {
    const sent = recordRequests()
    await expect(new AmazonShippingAdapter().getLabel(CREDS, 'shp-1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining('packageClientReferenceId'),
    })
    expect(sent()).toBe(0)
  })
})
