/**
 * Saleor list methods against a fake GraphQL endpoint that honours only the
 * documented connection arguments (docs.saleor.io/api-usage/pagination):
 * `first` ("The system only allows fetching up to 100 objects in a single
 * query."), `after` (a previous page's `endCursor`) and, where the root field
 * takes it, `channel` ("Slug of a channel for which the data should be
 * returned."). It answers with `edges { node }` and
 * `pageInfo { hasNextPage endCursor }`.
 *
 * The documents themselves are checked against Saleor's published schema out
 * of band; here the fake rejects the specific fields the old documents sent
 * that the schema does not have.
 */
import axios from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetCursorPager,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { SaleorAdapter } from '../../../../../../src/verticals/ecommerce/adapters/saleor'
import { ProductSchema } from '../../../../../../src/verticals/ecommerce/schema/product'
import { CustomerSchema } from '../../../../../../src/verticals/ecommerce/schema/customer'
import { OrderSchema } from '../../../../../../src/verticals/ecommerce/schema/order'
import { DiscountSchema } from '../../../../../../src/verticals/ecommerce/schema/discount'
import { TransactionSchema } from '../../../../../../src/verticals/ecommerce/schema/transaction'

const API = 'https://shop.saleor.cloud/graphql/'
const CREDS: Credentials = {
  accessToken: 'app-token',
  extra: { apiUrl: API, channelSlug: 'channel-eu' },
} as unknown as Credentials

interface Sent {
  query: string
  variables: Record<string, unknown>
}

let sent: Sent[] = []

// ── Documented node shapes ─────────────────────────────────────────────────

const money = (amount: number, currency = 'EUR') => ({ amount, currency })
const taxed = (amount: number, currency = 'EUR') => ({ gross: money(amount, currency) })
const address = {
  streetAddress1: '1 Main St',
  streetAddress2: '',
  city: 'Berlin',
  countryArea: '',
  postalCode: '10115',
  country: { code: 'DE' },
}

function productNode(i: number) {
  return {
    id: `UHJvZHVjdDo${i}`,
    name: `Product ${i}`,
    description: null,
    slug: `product-${i}`,
    productType: { id: 'UHJvZHVjdFR5cGU6MQ==', name: 'Shirts' },
    attributes: [],
    variants: [
      {
        id: `UHJvZHVjdFZhcmlhbnQ6${i}`,
        name: 'M',
        sku: `SKU-${i}`,
        pricing: { price: taxed(19.99) },
        weight: { value: 180, unit: 'G' },
        product: { id: `UHJvZHVjdDo${i}` },
      },
    ],
    media: [],
    created: '2026-01-10T12:00:00+00:00',
    updatedAt: '2026-02-01T09:00:00+00:00',
  }
}

function customerNode(i: number) {
  return {
    id: `VXNlcjo${i}`,
    email: `user${i}@example.com`,
    firstName: 'Ada',
    lastName: 'Lovelace',
    defaultShippingAddress: address,
    addresses: [address],
    dateJoined: '2026-01-15T10:00:00+00:00',
    updatedAt: '2026-06-01T12:00:00+00:00',
  }
}

function orderNode(i: number) {
  return {
    id: `T3JkZXI6${i}`,
    number: String(1000 + i),
    status: 'UNFULFILLED',
    user: { id: 'VXNlcjox', email: 'ada@example.com' },
    userEmail: 'ada@example.com',
    total: taxed(24.99),
    subtotal: taxed(19.99),
    shippingPrice: taxed(5),
    billingAddress: address,
    shippingAddress: address,
    lines: [
      {
        id: `T3JkZXJMaW5lOj${i}`,
        productName: 'Tee',
        productSku: 'SKU-1',
        quantity: 1,
        unitPrice: taxed(19.99),
        variant: { id: 'UHJvZHVjdFZhcmlhbnQ6MQ==', product: { id: 'UHJvZHVjdDox' } },
      },
    ],
    fulfillments: [],
    voucherCode: null,
    created: '2026-05-01T10:00:00+00:00',
    updatedAt: '2026-05-01T12:00:00+00:00',
  }
}

function voucherNode(i: number) {
  return {
    id: `Vm91Y2hlcjo${i}`,
    name: 'Summer',
    code: `SUMMER${i}`,
    discountValueType: 'PERCENTAGE',
    discountValue: 10,
    currency: 'EUR',
    type: 'ENTIRE_ORDER',
    usageLimit: null,
    used: 3,
    startDate: '2026-06-01T00:00:00+00:00',
    endDate: null,
    applyOncePerOrder: false,
    minSpent: null,
    products: { edges: [], pageInfo: { hasNextPage: false } },
    collections: { edges: [], pageInfo: { hasNextPage: false } },
  }
}

function transactionNode(i: number) {
  return {
    id: `VHJhbnNhY3Rpb25JdGVtOj${i}`,
    createdAt: '2026-05-01T10:00:00+00:00',
    pspReference: `psp_${i}`,
    order: { id: 'T3JkZXI6MQ==' },
    events: [
      { type: 'CHARGE_SUCCESS', amount: money(24.99), createdAt: '2026-05-01T10:00:05+00:00' },
    ],
  }
}

// ── Fake endpoint ──────────────────────────────────────────────────────────

const ROOTS: Record<
  string,
  { rows: (n: number) => unknown[]; channel: boolean; forbidden: RegExp[] }
> = {
  products: {
    rows: (n) => Array.from({ length: n }, (_, i) => productNode(i + 1)),
    channel: true,
    forbidden: [/isPublished/, /variants\s*\(/],
  },
  customers: {
    rows: (n) => Array.from({ length: n }, (_, i) => customerNode(i + 1)),
    channel: false,
    forbidden: [/lastName\s+phone/, /orders\s*\{\s*totalCount/],
  },
  orders: {
    rows: (n) => Array.from({ length: n }, (_, i) => orderNode(i + 1)),
    channel: true,
    forbidden: [/filter\s*:/, /\[String!\]/],
  },
  vouchers: {
    rows: (n) => Array.from({ length: n }, (_, i) => voucherNode(i + 1)),
    channel: true,
    forbidden: [/\bcreated\b/],
  },
  // Query.transactions (Saleor 3.22+): where/sortBy/before/after/first/last, no channel.
  transactions: {
    rows: (n) => Array.from({ length: n }, (_, i) => transactionNode(i + 1)),
    channel: false,
    forbidden: [/\bstatus\b/, /\btype\s+authorized/],
  },
}

/** The channel slug the fake expects on channel-scoped roots. */
let expectedChannel = 'channel-eu'

function installFake(total: number) {
  sent = []
  vi.spyOn(axios, 'post').mockImplementation(async (url: string, body: unknown) => {
    expect(url).toBe(API)
    const { query, variables } = body as Sent
    sent.push({ query, variables })
    const root = Object.keys(ROOTS).find((k) => new RegExp(`\\b${k}\\(first: \\$first`).test(query))
    if (!root) throw new Error(`fake: unexpected query ${query}`)
    const spec = ROOTS[root]!
    // An unused $channel variable fails GraphQL validation ("Variable
    // "$channel" is never used"), so the root field must take it.
    if (
      spec.channel &&
      !query.includes(`${root}(first: $first, after: $after, channel: $channel)`)
    ) {
      return { data: { errors: [{ message: `fake: Variable "$channel" is never used` }] } }
    }
    for (const bad of spec.forbidden) {
      if (bad.test(query))
        return { data: { errors: [{ message: `fake: invalid selection ${bad}` }] } }
    }
    const allowed = new Set(['first', 'after', ...(spec.channel ? ['channel'] : [])])
    for (const k of Object.keys(variables)) {
      if (!allowed.has(k)) throw new Error(`fake: undocumented argument ${k} on ${root}`)
    }
    const first = variables['first']
    if (typeof first !== 'number' || first < 1 || first > 100) {
      return { data: { errors: [{ message: 'fake: first must be 1..100' }] } }
    }
    if (spec.channel) expect(variables['channel']).toBe(expectedChannel)
    const after = variables['after'] as string | null | undefined
    const start = after ? Number(after.replace('cursor:', '')) + 1 : 0
    let all = spec.rows(total)
    // Honour the selection for the one nested field a row's mapping depends on.
    if (root === 'products' && !/pricing\(/.test(query)) {
      all = all.map((p) => ({
        ...(p as ReturnType<typeof productNode>),
        variants: (p as ReturnType<typeof productNode>).variants.map(({ pricing: _p, ...v }) => v),
      }))
    }
    const slice = all.slice(start, start + first)
    const endIndex = start + slice.length - 1
    return {
      data: {
        data: {
          [root]: {
            edges: slice.map((node) => ({ node, cursor: 'unused' })),
            pageInfo: {
              hasNextPage: endIndex < all.length - 1,
              endCursor: slice.length > 0 ? `cursor:${endIndex}` : null,
            },
          },
        },
      },
    }
  })
}

function sink(params: QueryParams): Record<string, unknown> {
  return (params as unknown as { __pageSink: Record<string, unknown> }).__pageSink
}

beforeEach(() => {
  _resetCursorPager()
  expectedChannel = 'channel-eu'
})
afterEach(() => vi.restoreAllMocks())

const adapter = new SaleorAdapter({ apiUrl: '', appToken: '' })

const CASES = [
  { method: 'listProducts', root: 'products', schema: ProductSchema },
  { method: 'listCustomers', root: 'customers', schema: CustomerSchema },
  { method: 'listOrders', root: 'orders', schema: OrderSchema },
  { method: 'listDiscounts', root: 'vouchers', schema: DiscountSchema },
  { method: 'listTransactions', root: 'transactions', schema: TransactionSchema },
] as const

describe('Saleor connection lists page by cursor', () => {
  it('declares Saleor’s documented 100-object page maximum', () => {
    expect(adapter.capabilities).toEqual({ maxPageSize: 100 })
  })

  for (const { method, root, schema } of CASES) {
    it(`${method}: walks 2L+1 rows as three pages, each id once, hasMore exact`, async () => {
      const L = 2
      installFake(2 * L + 1)
      const seen: string[] = []
      const hasMore: unknown[] = []
      for (let page = 1; page <= 3; page++) {
        const params = withPageSink({ page, limit: L } as QueryParams)
        const rows = (await adapter[method](CREDS, params)) as Array<{ id: string }>
        for (const row of rows) schema.parse(row)
        seen.push(...rows.map((r) => r.id))
        hasMore.push(sink(params)['hasMore'])
        expect(rows.length).toBe(page < 3 ? L : 1)
      }
      expect(new Set(seen).size).toBe(2 * L + 1)
      expect(seen.length).toBe(2 * L + 1)
      expect(hasMore).toEqual([true, true, false])
      // one request per page on a sequential walk, each carrying the caller's
      // size and the previous page's endCursor
      expect(sent.map((s) => [s.variables['first'], s.variables['after']])).toEqual([
        [L, null],
        [L, 'cursor:1'],
        [L, 'cursor:3'],
      ])
      expect(sent[0]!.query).toContain(`${root}(first: $first`)
    })

    it(`${method}: a page past the end is empty with hasMore false`, async () => {
      installFake(3)
      const params = withPageSink({ page: 5, limit: 2 } as QueryParams)
      expect(await adapter[method](CREDS, params)).toEqual([])
      expect(sink(params)['hasMore']).toBe(false)
    })

    it(`${method}: a direct call past 100 asks for 100 and reports that size`, async () => {
      installFake(3)
      const params = withPageSink({ page: 1, limit: 250 } as QueryParams)
      await adapter[method](CREDS, params)
      expect(sent[0]!.variables['first']).toBe(100)
      expect(sink(params)['pageSize']).toBe(100)
      expect(sink(params)['hasMore']).toBe(false)
    })
  }

  it('listProducts selects variant pricing, so priced variants come through', async () => {
    installFake(1)
    const [p] = await adapter.listProducts(CREDS, { page: 1, limit: 5 } as QueryParams)
    expect(p!.variants?.[0]?.price).toEqual({ amount: 1999, currency: 'EUR' })
  })

  it('keys the cursor walk by channel: another channel does not reuse its cursors', async () => {
    installFake(5)
    await adapter.listProducts(CREDS, { page: 1, limit: 2 } as QueryParams)
    expectedChannel = 'channel-us'
    const other = {
      ...CREDS,
      extra: { apiUrl: API, channelSlug: 'channel-us' },
    } as unknown as Credentials
    await adapter.listProducts(other, { page: 2, limit: 2 } as QueryParams)
    // page 2 on the new channel walks from its own page 1, not channel-eu's cursor
    expect(sent.slice(1).map((s) => s.variables['after'])).toEqual([null, 'cursor:1'])
    expect(sent.slice(1).every((s) => s.variables['channel'] === 'channel-us')).toBe(true)
  })

  it('listTransactions without an orderId pages the root transactions connection', async () => {
    installFake(1)
    const rows = await adapter.listTransactions(CREDS, { page: 1, limit: 5 } as QueryParams)
    expect(rows.map((r) => r.id)).toEqual(['VHJhbnNhY3Rpb25JdGVtOj1'])
    expect(sent[0]!.query).toMatch(/transactions\(first: \$first, after: \$after\)/)
    expect(sent[0]!.variables).toEqual({ first: 5, after: null })
  })

  it('listOrders scopes by the channel slug argument, not the ID-typed filter', async () => {
    installFake(1)
    await adapter.listOrders(CREDS, { page: 1, limit: 5 } as QueryParams)
    expect(sent[0]!.query).toMatch(/orders\(first: \$first, after: \$after, channel: \$channel\)/)
    expect(sent[0]!.query).toMatch(/\$channel: String\)/)
  })

  it('surfaces a GraphQL error instead of an empty page', async () => {
    sent = []
    vi.spyOn(axios, 'post').mockResolvedValue({
      data: { errors: [{ message: 'Cannot query field' }] },
    })
    await expect(adapter.listProducts(CREDS, { page: 1, limit: 5 } as QueryParams)).rejects.toThrow(
      /Cannot query field/,
    )
  })

  it('fails loudly on a response with no data', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: {} })
    await expect(
      adapter.listCustomers(CREDS, { page: 1, limit: 5 } as QueryParams),
    ).rejects.toThrow(/no data/)
  })
})

describe('Saleor get methods read back the ids a list returns', () => {
  function answer(field: string, node: unknown) {
    sent = []
    vi.spyOn(axios, 'post').mockImplementation(async (_url: string, body: unknown) => {
      sent.push(body as Sent)
      return { data: { data: { [field]: node } } }
    })
  }

  it('getProduct selects the plain variants list and no isPublished', async () => {
    answer('product', productNode(1))
    const p = await adapter.getProduct(CREDS, 'UHJvZHVjdDox')
    ProductSchema.parse(p)
    expect(sent[0]!.variables).toEqual({ id: 'UHJvZHVjdDox', channel: 'channel-eu' })
    expect(sent[0]!.query).not.toMatch(/isPublished|variants\s*\(/)
    expect(p.variants?.[0]?.price).toEqual({ amount: 1999, currency: 'EUR' })
  })

  it('getCustomer selects no User.phone', async () => {
    answer('user', customerNode(1))
    CustomerSchema.parse(await adapter.getCustomer(CREDS, 'VXNlcjox'))
    expect(sent[0]!.query).not.toMatch(/lastName\s+phone/)
  })

  it('getProduct passes the channel to product(id, channel)', async () => {
    answer('product', productNode(1))
    await adapter.getProduct(CREDS, 'UHJvZHVjdDox')
    expect(sent[0]!.query).toContain('product(id: $id, channel: $channel)')
  })

  it('getDiscount selects no Voucher.created and passes the channel', async () => {
    answer('voucher', voucherNode(1))
    DiscountSchema.parse(await adapter.getDiscount(CREDS, 'Vm91Y2hlcjox'))
    expect(sent[0]!.query).not.toMatch(/\bcreated\b/)
    expect(sent[0]!.query).toContain('voucher(id: $id, channel: $channel)')
    expect(sent[0]!.variables).toEqual({ id: 'Vm91Y2hlcjox', channel: 'channel-eu' })
  })

  it('a null lookup is a 404, not a TypeError', async () => {
    answer('voucher', null)
    await expect(adapter.getDiscount(CREDS, 'nope')).rejects.toMatchObject({ statusCode: 404 })
    vi.restoreAllMocks()
    answer('product', null)
    await expect(adapter.getProduct(CREDS, 'nope')).rejects.toMatchObject({ statusCode: 404 })
    vi.restoreAllMocks()
    answer('user', null)
    await expect(adapter.getCustomer(CREDS, 'nope')).rejects.toMatchObject({ statusCode: 404 })
    vi.restoreAllMocks()
    answer('transaction', null)
    await expect(adapter.getTransaction(CREDS, 'nope')).rejects.toMatchObject({
      statusCode: 404,
    })
    vi.restoreAllMocks()
    answer('order', null)
    await expect(
      adapter.listTransactions(CREDS, {
        page: 1,
        limit: 5,
        orderId: 'nope',
      } as unknown as QueryParams),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('Saleor transactions', () => {
  const tx = (id: string) => ({
    id,
    createdAt: '2026-05-01T10:00:00+00:00',
    pspReference: 'psp_1',
    order: { id: 'T3JkZXI6MQ==' },
    events: [
      { type: 'CHARGE_REQUEST', amount: money(24.99), createdAt: '2026-05-01T10:00:00+00:00' },
      { type: 'CHARGE_SUCCESS', amount: money(24.99), createdAt: '2026-05-01T10:00:05+00:00' },
    ],
  })

  it('listTransactions selects no TransactionItem.status/type and pages the order’s list locally', async () => {
    sent = []
    vi.spyOn(axios, 'post').mockImplementation(async (_url: string, body: unknown) => {
      sent.push(body as Sent)
      return {
        data: {
          data: { order: { id: 'T3JkZXI6MQ==', transactions: [tx('a'), tx('b'), tx('c')] } },
        },
      }
    })
    const seen: string[] = []
    const more: unknown[] = []
    for (let page = 1; page <= 2; page++) {
      const params = withPageSink({
        page,
        limit: 2,
        orderId: 'T3JkZXI6MQ==',
      } as unknown as QueryParams)
      const rows = await adapter.listTransactions(CREDS, params)
      rows.forEach((r) => TransactionSchema.parse(r))
      seen.push(...rows.map((r) => r.id))
      more.push(sink(params)['hasMore'])
    }
    expect(seen).toEqual(['a', 'b', 'c'])
    expect(more).toEqual([true, false])
    expect(sent[0]!.query).not.toMatch(/\bstatus\b|\btype\s+authorized/)
    expect(sent[0]!.variables).toEqual({ id: 'T3JkZXI6MQ==' })
  })

  it('getTransaction looks the id up with the transaction query', async () => {
    sent = []
    vi.spyOn(axios, 'post').mockImplementation(async (_url: string, body: unknown) => {
      sent.push(body as Sent)
      return { data: { data: { transaction: tx('VHJhbnNhY3Rpb25JdGVtOjE=') } } }
    })
    const t = await adapter.getTransaction(CREDS, 'VHJhbnNhY3Rpb25JdGVtOjE=')
    TransactionSchema.parse(t)
    expect(sent[0]!.query).toMatch(/transaction\(id: \$id\)/)
    expect(t).toMatchObject({
      kind: 'CAPTURE',
      status: 'SUCCESS',
      amount: { amount: 2499, currency: 'EUR' },
    })
  })
})
