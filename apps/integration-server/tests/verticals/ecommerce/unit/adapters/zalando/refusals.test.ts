/**
 * Zalando: the catalogue and stock reads refuse with 501 NOT_SUPPORTED before
 * sending anything.
 *
 * Products and variants. The adapter called GET /merchants/{id}/products,
 * /products/{id} and /articles/{ean}. None of them exists: the Products API
 * spec (https://developers.merchants.zalando.com/docs/openapi/specs/products.yaml)
 * declares only PUT /merchants/{merchant_id}/products/identifiers/{ean} and
 * GET /products/identifiers/{ean}. The only documented catalogue read is the
 * PSR GraphQL query psr.product_models
 * (https://developers.merchants.zalando.com/docs/psr-api-overview.html), and
 * the fields its examples document carry no product name (Product.title is
 * required) and price only per sales-channel offer, which may be null
 * (ProductVariant.price is required). The field reference is the interactive
 * documentation, which opens only "After you sent a valid and authenticated
 * query to the PSR API at least once".
 *
 * Inventory. The adapter called GET /merchants/{id}/stocks and /stocks/{ean}.
 * https://developers.merchants.zalando.com/docs/offers-stocks.html: "The API
 * currently consists of a single endpoint, which is used to update stock
 * levels: POST /merchants/{merchant_id}/stocks".
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { parseListQuery, withPageSink, type QueryParams } from '@opensteward/shared'
import { ZalandoAdapter } from '../../../../../../src/verticals/ecommerce/adapters/zalando/index'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'

const CREDS = { accessToken: 'zal_test' }

/** Replaces axios (instance and module verbs) so every request is recorded. */
function recordRequests(): string[] {
  const sent: string[] = []
  const verb =
    (name: string) =>
    async (path: string): Promise<never> => {
      sent.push(`${name} ${path}`)
      throw new Error(`fake zalando: unexpected ${name} ${path}`)
    }
  vi.spyOn(axios, 'create').mockReturnValue({
    get: verb('GET'),
    post: verb('POST'),
    put: verb('PUT'),
    patch: verb('PATCH'),
    delete: verb('DELETE'),
    request: verb('REQUEST'),
  } as unknown as ReturnType<typeof axios.create>)
  vi.spyOn(axios, 'get').mockImplementation(verb('GET') as never)
  vi.spyOn(axios, 'post').mockImplementation(verb('POST') as never)
  return sent
}

function newAdapter(sandbox = false): ZalandoAdapter {
  return new ZalandoAdapter({
    clientId: 'cid',
    clientSecret: 'secret',
    merchantId: '11111111-2222-3333-4444-555555555555',
    sandbox,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

type ListName = 'listProducts' | 'listVariants' | 'listInventoryLevels'
type GetName = 'getProduct' | 'getVariant' | 'getInventoryLevel'

describe.each<[ListName, RegExp]>([
  ['listProducts', /^Zalando cannot list products: /],
  ['listVariants', /^Zalando cannot list variants: /],
  ['listInventoryLevels', /^Zalando cannot list inventory levels: /],
])('ZalandoAdapter %s', (name, message) => {
  it.each<[Record<string, string>, Record<string, unknown>]>([
    [{}, {}],
    [{ page: '2', limit: '10' }, {}],
    [{}, { productId: 'VE042D04C', updatedAfter: new Date('2026-01-01T00:00:00Z') }],
  ])(
    'refuses with 501 NOT_SUPPORTED and sends no request (query %o, extra %o)',
    async (q, extra) => {
      for (const sandbox of [false, true]) {
        const sent = recordRequests()
        const adapter = newAdapter(sandbox)
        const params = withPageSink({
          ...parseListQuery(q, adapter as EcommerceAdapter),
          ...extra,
        } as QueryParams)
        const err = await adapter[name](CREDS, params).then(
          () => undefined,
          (e: unknown) => e as Error & { statusCode?: number; code?: string },
        )
        expect(err).toBeDefined()
        expect(err!.statusCode).toBe(501)
        expect(err!.code).toBe('NOT_SUPPORTED')
        expect(err!.message).toMatch(message)
        expect(sent).toEqual([])
        vi.restoreAllMocks()
      }
    },
  )
})

describe.each<[GetName, string, RegExp]>([
  ['getProduct', 'VE042D04C', /^Zalando cannot read a product: /],
  ['getVariant', '4351261305360', /^Zalando cannot read a variant: .*items\[\]\.ean/],
  ['getInventoryLevel', '4351261305360:loc', /^Zalando cannot read an inventory level: /],
])('ZalandoAdapter %s', (name, id, message) => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const sent = recordRequests()
    const adapter = newAdapter()
    const err = await adapter[name](CREDS, id).then(
      () => undefined,
      (e: unknown) => e as Error & { statusCode?: number; code?: string },
    )
    expect(err).toBeDefined()
    expect(err!.statusCode).toBe(501)
    expect(err!.code).toBe('NOT_SUPPORTED')
    expect(err!.message).toMatch(message)
    expect(sent).toEqual([])
  })
})
