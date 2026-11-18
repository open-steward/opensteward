/**
 * listCollections and listLocations against Centra's Order API reference
 * (https://centra.dev/legacy/order-api/api-reference):
 *
 * - There is no categories endpoint. GET <base>/products "will return product
 *   data from Centra with categories", each row's `categories` being an
 *   "Array with names of the categories the product belongs to." Its `limit`
 *   doc: "You will get this amount of products, and a "next" parameter in
 *   return if there are multiple pages." (example `"next": "?limit=10&page=3"`).
 *   So collections are the distinct names over every products page.
 * - There is no warehouse or location endpoint. Warehouses surface only per
 *   shipment line (`"warehouses": [{"name": "Default warehouse", "itemQty":
 *   "1"}]`) of Get shipments, which "will list all Good to Go-shipments that
 *   are not sent, oldest first." — not a list of locations — so listLocations
 *   refuses with 501 before sending anything.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
} from '@opensteward/shared'
import { CentraAdapter } from '../../../../../../src/verticals/ecommerce/adapters/centra'
import { CollectionSchema } from '../../../../../../src/verticals/ecommerce/schema/collection'

const CREDS: Credentials = {
  accessToken: 'key',
  extra: { baseUrl: 'https://brand.centra.example/api/order-api' },
}

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let rows: Array<Record<string, unknown>> = []
/** Upstream page numbers advance by this much; only `next` finds them. */
let stride = 1

/** GET products, honouring only the documented `limit` and `next` page. */
function respond(path: string, params: Record<string, unknown> = {}) {
  calls.push({ path, params: { ...params } })
  if (path !== 'products') throw new Error(`unexpected path ${path}`)
  for (const k of Object.keys(params)) {
    if (k !== 'limit' && k !== 'page') throw new Error(`undocumented parameter ${k}`)
  }
  const limit = Number(params['limit'] ?? 20)
  const index = (Number(params['page'] ?? 1) - 1) / stride
  if (!Number.isInteger(index)) throw new Error(`no page ${String(params['page'])}`)
  const start = index * limit
  const body: Record<string, unknown> = { status: 'ok', products: rows.slice(start, start + limit) }
  if (start + limit < rows.length) {
    body['next'] = `?limit=${limit}&page=${Number(params['page'] ?? 1) + stride}`
  }
  return { data: body }
}

const get = vi.fn(async (path: string, c?: { params?: Record<string, unknown> }) =>
  respond(path, c?.params),
)

beforeEach(() => {
  calls = []
  rows = []
  stride = 1
  get.mockClear()
  vi.spyOn(axios, 'create').mockImplementation((() => ({ get })) as never)
})
afterEach(() => vi.restoreAllMocks())

/** Product rows whose categories repeat across rows and upstream pages. */
function productsWithCategories(n: number, categoriesOf: (i: number) => unknown) {
  return Array.from({ length: n }, (_, i) => ({
    productId: i,
    variantId: 1,
    stockItemId: i,
    categories: categoriesOf(i),
  }))
}

describe('centra listCollections', () => {
  it('serves 2L+1 distinct categories across pages 1..3, each once, with exact hasMore', async () => {
    const L = 3
    // 250 product rows (three upstream pages of 100): category c<k> first
    // appears on row 40k, and each row repeats the one before it.
    rows = productsWithCategories(250, (i) => [
      `c${Math.floor(i / 40)}`,
      ...(i >= 40 ? [`c${Math.floor(i / 40) - 1}`] : []),
    ])
    const adapter = new CentraAdapter()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const out = await adapter.listCollections(CREDS, params)
      for (const c of out) CollectionSchema.parse(c)
      seen.push(...out.map((c) => c.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(2 * L + 1)
    }
    expect(seen).toEqual(['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6'])
    expect(more).toEqual([true, true, false])
  })

  it('walks every products page by the documented `next`, sending only limit and page', async () => {
    stride = 3
    rows = productsWithCategories(250, (i) => (i === 249 ? ['Last'] : ['First']))
    const out = await new CentraAdapter().listCollections(
      CREDS,
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(out.map((c) => c.id)).toEqual(['First', 'Last'])
    expect(calls.map((c) => c.params)).toEqual([
      { limit: 100, page: 1 },
      { limit: 100, page: 4 },
      { limit: 100, page: 7 },
    ])
  })

  it('reads the documented example categories as name strings', async () => {
    rows = [
      {
        productId: 1,
        categories: JSON.parse('["Collection \\/ Jackets\\/Outerwear", "New Arrivals"]'),
      },
    ]
    const out = await new CentraAdapter().listCollections(
      CREDS,
      withPageSink({ page: 1, limit: 20 }),
    )
    expect(out.map((c) => CollectionSchema.parse(c))).toEqual([
      {
        id: 'Collection / Jackets/Outerwear',
        title: 'Collection / Jackets/Outerwear',
        metadata: { name: 'Collection / Jackets/Outerwear' },
      },
      { id: 'New Arrivals', title: 'New Arrivals', metadata: { name: 'New Arrivals' } },
    ])
    // A listed id containing '/' reads back unchanged (the router hands the
    // adapter the decoded path segment, so callers percent-encode '/').
    const back = await new CentraAdapter().getCollection!(CREDS, 'Collection / Jackets/Outerwear')
    expect(CollectionSchema.parse(back).id).toBe('Collection / Jackets/Outerwear')
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    rows = productsWithCategories(7, (i) => [`c${i}`])
    const adapter = new CentraAdapter()
    const params = parseListQuery({ page: '2', limit: '3' })
    const out = listPage(await adapter.listCollections(CREDS, params), params, 'centra')
    expect(out.data.map((c) => c.id)).toEqual(['c3', 'c4', 'c5'])
    expect(out.meta.hasMore).toBe(true)
    const last = parseListQuery({ page: '3', limit: '3' })
    const tail = listPage(await adapter.listCollections(CREDS, last), last, 'centra')
    expect(tail.data.map((c) => c.id)).toEqual(['c6'])
    expect(tail.meta.hasMore).toBe(false)
  })

  it('getCollection finds a category beyond the first products page', async () => {
    rows = productsWithCategories(150, (i) => [`c${i}`])
    const found = await new CentraAdapter().getCollection!(CREDS, 'c149')
    expect(found.id).toBe('c149')
    await expect(new CentraAdapter().getCollection!(CREDS, 'nope')).rejects.toThrow(/not found/)
  })
})

describe('centra listLocations', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const adapter = new CentraAdapter()
    await expect(
      adapter.listLocations!(CREDS, withPageSink({ page: 1, limit: 20 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(get).not.toHaveBeenCalled()
  })

  it('getLocation refuses the same way and sends no request', async () => {
    await expect(new CentraAdapter().getLocation!(CREDS, 'default')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
  })
})
