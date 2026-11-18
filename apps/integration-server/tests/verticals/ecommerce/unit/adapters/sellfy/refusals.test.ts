/**
 * Sellfy: every list and get method refuses with 501 NOT_SUPPORTED before
 * sending anything.
 *
 * These methods were copied from the Shopify adapter and called Shopify's
 * Admin REST API (products.json, orders.json, ... on {shop}.myshopify.com).
 * Sellfy's only first-party API reference is https://api.sellfy.com/openapi.json
 * (rendered by https://api.sellfy.com/). Its servers entry is
 * "https://api.sellfy.com" and it has exactly five operations: GET /ping/,
 * GET /v1/licenses/validate/, POST /v1/licenses/activations/,
 * DELETE /v1/licenses/activations/{activation_id}/ and POST
 * /v1/licenses/revoke/. Its Licenses tag reads "Validate, activate and revoke
 * license keys sold with Sellfy products." It documents no product, variant,
 * collection, location, inventory, customer, order, fulfillment, refund,
 * transaction or discount resource.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { parseListQuery, withPageSink, type QueryParams } from '@opensteward/shared'
import { SellfyAdapter } from '../../../../../../src/verticals/ecommerce/adapters/sellfy/index'

const CREDS = { accessToken: 'sellfy-token' }

function makeAdapter(): SellfyAdapter {
  return new SellfyAdapter({
    clientId: 'client',
    clientSecret: 'secret',
    redirectUri: 'https://example.test/callback',
    shop: 'store',
  })
}

/** Records every HTTP call the adapter could make, via axios or fetch. */
function recordRequests(): string[] {
  const sent: string[] = []
  const verb =
    (name: string) =>
    async (path: string): Promise<never> => {
      sent.push(`${name} ${path}`)
      throw new Error(`fake sellfy: unexpected ${name} ${path}`)
    }
  const instance = {
    get: verb('GET'),
    post: verb('POST'),
    put: verb('PUT'),
    patch: verb('PATCH'),
    delete: verb('DELETE'),
    request: verb('REQUEST'),
    interceptors: { request: { use: () => 0 }, response: { use: () => 0 } },
  }
  vi.spyOn(axios, 'create').mockReturnValue(instance as unknown as ReturnType<typeof axios.create>)
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    sent.push(`FETCH ${String(input)}`)
    throw new Error('fake sellfy: unexpected fetch')
  })
  return sent
}

afterEach(() => {
  vi.restoreAllMocks()
})

type ListName =
  | 'listProducts'
  | 'listVariants'
  | 'listCollections'
  | 'listLocations'
  | 'listInventoryLevels'
  | 'listCustomers'
  | 'listOrders'
  | 'listFulfillments'
  | 'listRefunds'
  | 'listTransactions'
  | 'listDiscounts'

type GetName =
  | 'getProduct'
  | 'getVariant'
  | 'getCollection'
  | 'getLocation'
  | 'getCustomer'
  | 'getOrder'
  | 'getFulfillment'
  | 'getRefund'
  | 'getTransaction'
  | 'getDiscount'

describe.each<[ListName, string]>([
  ['listProducts', 'products'],
  ['listVariants', 'variants'],
  ['listCollections', 'collections'],
  ['listLocations', 'locations'],
  ['listInventoryLevels', 'inventory levels'],
  ['listCustomers', 'customers'],
  ['listOrders', 'orders'],
  ['listFulfillments', 'fulfillments'],
  ['listRefunds', 'refunds'],
  ['listTransactions', 'transactions'],
  ['listDiscounts', 'discounts'],
])('SellfyAdapter %s', (name, resource) => {
  // The Shopify-copied bodies read order_id, product_id, location_ids and
  // inventory_item_ids from params, so a request sent only when one of those
  // is present must still be caught.
  it.each<[Record<string, string>, Record<string, string>]>([
    [{}, {}],
    [{ page: '2', limit: '10' }, {}],
    [{ updated_after: '2026-01-01T00:00:00Z' }, {}],
    [{}, { order_id: '42' }],
    [{}, { product_id: '7' }],
    [{}, { location_ids: '1', inventory_item_ids: '2' }],
  ])(
    'refuses with 501 NOT_SUPPORTED and sends no request (query %o, extra %o)',
    async (q, extra) => {
      const sent = recordRequests()
      const adapter = makeAdapter()
      const list = adapter[name].bind(adapter) as (
        c: typeof CREDS,
        p: QueryParams,
      ) => Promise<unknown>
      const params = withPageSink({ ...parseListQuery(q), ...extra } as QueryParams)
      await expect(list(CREDS, params)).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringContaining(`Sellfy cannot list ${resource}`),
      })
      expect(sent).toEqual([])
    },
  )
})

describe.each<[GetName, string, string]>([
  ['getProduct', '1', 'products'],
  ['getVariant', '2', 'variants'],
  ['getCollection', '3', 'collections'],
  ['getLocation', '4', 'locations'],
  ['getCustomer', '5', 'customers'],
  ['getOrder', '6', 'orders'],
  ['getFulfillment', '7', 'fulfillments'],
  ['getRefund', '42:8', 'refunds'],
  ['getTransaction', '42:9', 'transactions'],
  ['getDiscount', '10', 'discounts'],
])('SellfyAdapter %s(%s)', (name, id, resource) => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const sent = recordRequests()
    const adapter = makeAdapter()
    const get = adapter[name].bind(adapter) as (c: typeof CREDS, id: string) => Promise<unknown>
    await expect(get(CREDS, id)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining(`Sellfy cannot read ${resource}`),
    })
    expect(sent).toEqual([])
  })
})

describe('SellfyAdapter refusal reason', () => {
  it('cites the documented license-key-only API', async () => {
    recordRequests()
    const adapter = makeAdapter()
    await expect(adapter.listOrders(CREDS, withPageSink({} as QueryParams))).rejects.toThrow(
      'Sellfy cannot list orders: its only public API (https://api.sellfy.com/openapi.json) ' +
        'covers /ping/ and license keys: ' +
        '"Validate, activate and revoke license keys sold with Sellfy products."',
    )
  })
})
