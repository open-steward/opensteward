/**
 * CS-Cart read methods that refuse before sending anything (501 NOT_SUPPORTED).
 *
 * Checked against the first-party REST API docs, CS-Cart 4.21.x:
 *
 * - Locations. The Supported Entities list at
 *   https://docs.cs-cart.com/latest/developer_guide/api/entities/index.html
 *   ("Auth, Blocks, Carts, Call Requests, Categories, Discussions, Languages,
 *   Langvars, MasterProducts, MasterProductOffers, Orders, Pages, Payment
 *   Methods, Products, Product Features, Product Variations, Product Variation
 *   Groups, Product Options, Product Option Combinations, Product Option
 *   Exceptions, Settings, Shipments, Shipping Methods, Statuses, Stores, Taxes,
 *   Users, Usergroups, Vendors") has no warehouse or location entity. The
 *   adapter used to call GET /api/warehouses and, on the 404, invent a
 *   'default' row on every page.
 *
 * - Discounts. The same list has no Promotions entity; promotions appear only
 *   as order fields ("promotion_ids string A string of promotion IDs separated
 *   by commas.", https://docs.cs-cart.com/latest/developer_guide/api/entities/orders.html).
 *   The adapter called GET /api/promotions.
 *
 * - Variants. Product Variations (GET /api/product_variations) document
 *   "Fields are inherited from Products", whose price is "The base product
 *   price in your store’s primary currency"
 *   (https://docs.cs-cart.com/latest/developer_guide/api/entities/products.html).
 *   No documented field, entity (Supported Entities has no currencies) or
 *   credential gives that currency's code, and canonical Money requires one,
 *   so no documented response can be mapped to a ProductVariant. (Option
 *   combinations, /api/combinations, carry no price at all.)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { parseListQuery, withPageSink, type QueryParams } from '@opensteward/shared'
import { CsCartAdapter } from '../../../../../../src/verticals/ecommerce/adapters/cscart/index'

const CREDS = {
  accessToken: 'api-key',
  extra: { baseUrl: 'https://shop.example.com', email: 'admin@example.com' },
}

function fakeHttp() {
  const http = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
  const create = vi.spyOn(axios, 'create').mockReturnValue(http as never)
  const sent = () =>
    create.mock.calls.length +
    http.get.mock.calls.length +
    http.post.mock.calls.length +
    http.put.mock.calls.length +
    http.delete.mock.calls.length
  return { sent }
}

afterEach(() => vi.restoreAllMocks())

const NOT_SUPPORTED = { statusCode: 501, code: 'NOT_SUPPORTED' }

type ListName = 'listLocations' | 'listDiscounts' | 'listVariants'

describe('CS-Cart list methods with no documented list', () => {
  it.each<[ListName, string, Record<string, string>]>([
    ['listLocations', 'cannot list locations: the REST API documents no warehouse', {}],
    [
      'listLocations',
      'cannot list locations: the REST API documents no warehouse',
      { page: '2', limit: '5' },
    ],
    ['listDiscounts', 'cannot list discounts: the REST API documents no Promotions', {}],
    [
      'listDiscounts',
      'cannot list discounts: the REST API documents no Promotions',
      { page: '2', limit: '5' },
    ],
    ['listVariants', 'cannot list variants: variant prices', {}],
    [
      'listVariants',
      'cannot list variants: variant prices',
      { product_id: '12', page: '1', limit: '2' },
    ],
  ])(
    '%s refuses with 501 NOT_SUPPORTED (%s) and sends nothing (query %o)',
    async (name, reason, q) => {
      const { sent } = fakeHttp()
      const adapter = new CsCartAdapter()
      const list = adapter[name].bind(adapter) as (
        c: typeof CREDS,
        p: QueryParams,
      ) => Promise<unknown>
      await expect(list(CREDS, withPageSink(parseListQuery(q)))).rejects.toMatchObject({
        ...NOT_SUPPORTED,
        message: expect.stringContaining(reason),
      })
      expect(sent()).toBe(0)
    },
  )
})

describe('CS-Cart get methods paired with a refused list', () => {
  it.each<['getLocation' | 'getDiscount' | 'getVariant', string, string]>([
    ['getLocation', 'default', 'cannot get a location: the REST API documents no warehouse'],
    ['getLocation', '3', 'cannot get a location: the REST API documents no warehouse'],
    ['getDiscount', '7', 'cannot get a discount: the REST API documents no Promotions'],
    ['getVariant', '12:822274303', 'cannot get a variant: variant prices'],
  ])('%s(%s) refuses with 501 NOT_SUPPORTED (%s) and sends nothing', async (name, id, reason) => {
    const { sent } = fakeHttp()
    const adapter = new CsCartAdapter()
    const get = adapter[name].bind(adapter) as (c: typeof CREDS, id: string) => Promise<unknown>
    await expect(get(CREDS, id)).rejects.toMatchObject({
      ...NOT_SUPPORTED,
      message: expect.stringContaining(reason),
    })
    expect(sent()).toBe(0)
  })
})
