/**
 * Pinterest Shop: the product and order reads refuse with 501 NOT_SUPPORTED
 * before sending anything.
 *
 * Source: Pinterest's own OpenAPI spec, v5.28.0
 * (https://raw.githubusercontent.com/pinterest/api-description/main/v5/openapi.yaml).
 *
 * - `/catalogs/items` has only `operationId: items/post` ("Get catalogs items
 *   (POST)"). Its body `CatalogsItemsRequest` requires `country`, `filters`
 *   and `language`, and `CatalogsRetailItemsPostFilter` requires
 *   `catalog_type` and `item_ids`. It is a lookup by item id with no
 *   `bookmark` or `page_size`, so it cannot list. The spec has no
 *   `/catalogs/items/{item_id}` path, and the connection carries no country or
 *   language, so getProduct refuses too.
 * - The spec has no order resource. listOrders used to map
 *   `GET /catalogs/feeds/{feed_id}/processing_results` ("List feed processing
 *   results", feed-ingestion job reports) onto canonical Orders.
 *
 * listProducts used to send a bare `GET /catalogs/items` with page_size=25.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import { PinterestShopAdapter } from '../../../../../../src/verticals/ecommerce/adapters/pinterest-shop/index'

const CREDS = { accessToken: 'tok', refreshToken: 'ref' }

/** Replaces axios.create so every HTTP verb the client could send is recorded. */
function recordRequests(): string[] {
  const sent: string[] = []
  const verb =
    (name: string) =>
    async (path: string): Promise<never> => {
      sent.push(`${name} ${path}`)
      throw new Error(`fake pinterest: unexpected ${name} ${path}`)
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

async function expectRefusal(call: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  const err = await call().then(
    () => undefined,
    (e: unknown) => e as Error & { statusCode?: number; code?: string },
  )
  expect(err, 'expected a refusal').toBeDefined()
  expect(err!.statusCode).toBe(501)
  expect(err!.code).toBe('NOT_SUPPORTED')
  expect(err!.message).toMatch(pattern)
}

describe('Pinterest Shop refuses undocumented reads before sending', () => {
  it('listProducts refuses page 1 and page 2 without a request', async () => {
    const sent = recordRequests()
    const adapter = new PinterestShopAdapter()
    await expectRefusal(
      () => adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 3 })),
      /cannot list products.*items\/post/,
    )
    await expectRefusal(
      () => adapter.listProducts(CREDS, withPageSink({ page: 2, limit: 3, feedId: '123' })),
      /cannot list products/,
    )
    expect(sent).toEqual([])
  })

  it('getProduct refuses without a request', async () => {
    const sent = recordRequests()
    await expectRefusal(
      () => new PinterestShopAdapter().getProduct(CREDS, 'SKU-1'),
      /cannot read a product.*country.*language/,
    )
    expect(sent).toEqual([])
  })

  it('listOrders refuses without a request, with or without a feedId', async () => {
    const sent = recordRequests()
    const adapter = new PinterestShopAdapter()
    await expectRefusal(
      () => adapter.listOrders(CREDS, withPageSink({ page: 1, limit: 3 })),
      /cannot list orders/,
    )
    await expectRefusal(
      () => adapter.listOrders(CREDS, withPageSink({ page: 1, limit: 3, feedId: '123' })),
      /cannot list orders/,
    )
    expect(sent).toEqual([])
  })
})
