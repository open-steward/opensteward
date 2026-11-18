/**
 * Bumpa: the read methods whose resource Bumpa does not document refuse with
 * 501 NOT_SUPPORTED before sending anything.
 *
 * Bumpa's only first-party API reference is the Postman collection "Bumpa API
 * v1" that https://docs.bumpa.io renders, served as JSON from
 * https://docs.bumpa.io/api/collections/54114412/2sBXqDsNUN. Its overview says
 * "Base path: /api/commerce/v1", and its 21 requests cover products, carts,
 * shipping-options, checkouts, analytics and orders only. It documents no
 * locations, collections, inventory, customers, discounts, refunds or
 * transactions request. Location appears only as a query parameter: "Merchant
 * routes are also location-scoped. Pass location_id explicitly to avoid
 * silently falling back to the store default location."
 *
 * listLocations used to call a /v1/locations path that does not exist, swallow
 * the 404 and return a synthetic 'default' location. It now refuses instead,
 * as does getLocation (which returned the same synthetic record for 'default').
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { parseListQuery, withPageSink, type QueryParams } from '@opensteward/shared'
import { BumpaAdapter } from '../../../../../../src/verticals/ecommerce/adapters/bumpa/index'

const CREDS = { accessToken: 'bumpa-key' }

/** Replaces axios.create so every HTTP verb the client could send is recorded. */
function recordRequests(): string[] {
  const sent: string[] = []
  const verb =
    (name: string) =>
    async (path: string): Promise<never> => {
      sent.push(`${name} ${path}`)
      throw new Error(`fake bumpa: unexpected ${name} ${path}`)
    }
  vi.spyOn(axios, 'create').mockReturnValue({
    get: verb('GET'),
    post: verb('POST'),
    put: verb('PUT'),
    patch: verb('PATCH'),
    delete: verb('DELETE'),
  } as unknown as ReturnType<typeof axios.create>)
  return sent
}

afterEach(() => {
  vi.restoreAllMocks()
})

type ListName =
  | 'listLocations'
  | 'listCollections'
  | 'listInventoryLevels'
  | 'listCustomers'
  | 'listRefunds'
  | 'listTransactions'
  | 'listDiscounts'

type GetName =
  'getLocation' | 'getCollection' | 'getCustomer' | 'getRefund' | 'getTransaction' | 'getDiscount'

describe.each<[ListName, string]>([
  ['listLocations', 'locations'],
  ['listCollections', 'collections'],
  ['listInventoryLevels', 'inventory levels'],
  ['listCustomers', 'customers'],
  ['listRefunds', 'refunds'],
  ['listTransactions', 'transactions'],
  ['listDiscounts', 'discounts'],
])('BumpaAdapter %s', (name, resource) => {
  // parseListQuery drops order_id, so `extra` is merged in after parsing. The
  // pre-refusal listRefunds/listTransactions read params.order_id, so a
  // request sent only when an order id is present must still be caught.
  it.each<[Record<string, string>, Record<string, string>]>([
    [{}, {}],
    [{ page: '2', limit: '10' }, {}],
    [{}, { order_id: '42' }],
  ])(
    'refuses with 501 NOT_SUPPORTED and sends no request (query %o, extra %o)',
    async (q, extra) => {
      const sent = recordRequests()
      const adapter = new BumpaAdapter()
      const list = adapter[name].bind(adapter) as (
        c: typeof CREDS,
        p: QueryParams,
      ) => Promise<unknown>
      const params = withPageSink({ ...parseListQuery(q), ...extra } as QueryParams)
      expect(params).toMatchObject(extra)
      await expect(list(CREDS, params)).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringContaining(`Bumpa cannot list ${resource}`),
      })
      expect(sent).toEqual([])
    },
  )
})

describe.each<[GetName, string]>([
  ['getLocation', 'default'],
  ['getLocation', '77'],
  ['getCollection', '5'],
  ['getCustomer', '9'],
  ['getRefund', '42:7'],
  ['getTransaction', '42:8'],
  ['getDiscount', '3'],
])('BumpaAdapter %s(%s)', (name, id) => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const sent = recordRequests()
    const adapter = new BumpaAdapter()
    const get = adapter[name].bind(adapter) as (c: typeof CREDS, id: string) => Promise<unknown>
    await expect(get(CREDS, id)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining('/api/commerce/v1'),
    })
    expect(sent).toEqual([])
  })
})
