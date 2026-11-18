/**
 * Adapter-level request shape and pagination. Every path here was
 * confirmed by fetching developers.tray.com.br with curl (see
 * `client.ts`'s file header) — including the corrections this revision
 * makes over a prior draft: variants live at `/products/variants`, not
 * `/variations`; category tree is `/categories/tree/:id`; cancel-order is
 * `PUT /orders/cancel/:id`, not `/orders/:id/cancel`; Multi-CD is a
 * separate JSON surface at `/multicd/...`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import { TrayCommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapters/tray-commerce'
import { TrayCommerceClient } from '../../../../../../src/verticals/ecommerce/adapters/tray-commerce/client'
import { MAX_PAGE_SIZE } from '../../../../../../src/verticals/ecommerce/adapters/tray-commerce/constants'

const CREDENTIALS = {
  accessToken: 'tok',
  extra: { apiHost: 'https://minhaloja.commercesuite.com.br/web_api' },
}

const CONFIG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'https://ourapp.example/auth/ecommerce/tray-commerce/callback',
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TrayCommerceAdapter — request shape and pagination', () => {
  const adapter = new TrayCommerceAdapter(CONFIG)

  it('clamps `limit` to the declared maxPageSize (verified: maxLimit is 50 in every documented example) and defaults page to 1', async () => {
    const get = vi.spyOn(TrayCommerceClient.prototype, 'get').mockResolvedValue({ Products: [] })
    await adapter.listProducts(CREDENTIALS, { limit: 500 })
    expect(get).toHaveBeenCalledWith('products', { limit: MAX_PAGE_SIZE, page: 1 })
  })

  it('forwards an explicit page number', async () => {
    const get = vi.spyOn(TrayCommerceClient.prototype, 'get').mockResolvedValue({ Products: [] })
    await adapter.listProducts(CREDENTIALS, { page: 3, limit: 10 })
    expect(get).toHaveBeenCalledWith('products', { limit: 10, page: 3 })
  })

  it('unwraps {Products:[{Product:{...}}]} and reports hasMore from the legacy paging block', async () => {
    vi.spyOn(TrayCommerceClient.prototype, 'get').mockResolvedValue({
      paging: { total: 120, page: 1, limit: 50, offset: 0, maxLimit: 50 },
      Products: [{ Product: { id: 1, name: 'Keyboard' } }],
    })
    const params = withPageSink({ limit: 50 })
    const products = await adapter.listProducts(CREDENTIALS, params)
    expect(products).toEqual([expect.objectContaining({ id: '1', title: 'Keyboard' })])
    expect(readUpstreamPage(params)).toEqual({ hasMore: true })
  })

  it('reports nothing when the platform sends no usable paging block', async () => {
    vi.spyOn(TrayCommerceClient.prototype, 'get').mockResolvedValue({ Products: [] })
    const params = withPageSink({ limit: 50 })
    await adapter.listProducts(CREDENTIALS, params)
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('creates a product via postForm on /products, wrapped as Product, then re-fetches it', async () => {
    const postForm = vi
      .spyOn(TrayCommerceClient.prototype, 'postForm')
      .mockResolvedValue({ id: 77 })
    const get = vi
      .spyOn(TrayCommerceClient.prototype, 'get')
      .mockResolvedValue({ Product: { id: 77, name: 'New Product' } })
    const product = await adapter.createProduct(CREDENTIALS, { title: 'New Product' })
    expect(postForm).toHaveBeenCalledWith('products', 'Product', expect.objectContaining({ name: 'New Product' }))
    expect(get).toHaveBeenCalledWith('products/77')
    expect(product.id).toBe('77')
  })

  it('deletes a product on DELETE /products/:id', async () => {
    const del = vi.spyOn(TrayCommerceClient.prototype, 'delete').mockResolvedValue(undefined)
    await adapter.deleteProduct(CREDENTIALS, '77')
    expect(del).toHaveBeenCalledWith('products/77')
  })

  it('lists variants at /products/variants/, scoping by product_id (not id_product_parent) when a productId param is given', async () => {
    const get = vi.spyOn(TrayCommerceClient.prototype, 'get').mockResolvedValue({ Variants: [] })
    await adapter.listVariants(CREDENTIALS, { limit: 50, productId: '100' })
    expect(get).toHaveBeenCalledWith('products/variants/', { limit: 50, page: 1, product_id: '100' })
  })

  it('gets a variant at /products/variants/:id, unwrapping {Variant:{...}}', async () => {
    vi.spyOn(TrayCommerceClient.prototype, 'get').mockResolvedValue({ Variant: { id: 3, product_id: 18 } })
    const variant = await adapter.getVariant(CREDENTIALS, '3')
    expect(variant.id).toBe('3')
    expect(variant.productId).toBe('18')
  })

  it('creates a variant via postForm on /products/variants/, wrapped as Variant', async () => {
    const postForm = vi.spyOn(TrayCommerceClient.prototype, 'postForm').mockResolvedValue({ id: 3 })
    vi.spyOn(TrayCommerceClient.prototype, 'get').mockResolvedValue({ Variant: { id: 3, product_id: 18 } })
    await adapter.createVariant?.(CREDENTIALS, { productId: '18', sku: 'REF-1' })
    expect(postForm).toHaveBeenCalledWith(
      'products/variants/',
      'Variant',
      expect.objectContaining({ product_id: '18', reference: 'REF-1' }),
    )
  })

  it('deletes a variant on DELETE /products/variants/:id', async () => {
    const del = vi.spyOn(TrayCommerceClient.prototype, 'delete').mockResolvedValue(undefined)
    await adapter.deleteVariant?.(CREDENTIALS, '3')
    expect(del).toHaveBeenCalledWith('products/variants/3')
  })

  it('fetches the category tree from /categories/tree/0 and flattens it for listCollections', async () => {
    const get = vi.spyOn(TrayCommerceClient.prototype, 'get').mockResolvedValue({
      Category: [
        { Category: { id: 1, name: 'Electronics', children: [{ Category: { id: 2, name: 'Keyboards' } }] } },
      ],
    })
    const collections = await adapter.listCollections(CREDENTIALS, {})
    expect(get).toHaveBeenCalledWith('categories/tree/0')
    expect(collections.map((c) => c.id)).toEqual(['1', '2'])
  })

  it('pages the (unpaginated) category tree locally, so every category is reachable', async () => {
    // The adapter declares maxPageSize 50, so the router asks for at most 50.
    // Answering page 2 with nothing left the 51st category unreachable.
    const tree = Array.from({ length: 60 }, (_, i) => ({ Category: { id: i + 1, name: `C${i + 1}` } }))
    vi.spyOn(TrayCommerceClient.prototype, 'get').mockResolvedValue({ Category: tree })
    const p1 = withPageSink({ page: 1, limit: 50 })
    const p2 = withPageSink({ page: 2, limit: 50 })
    const first = await adapter.listCollections(CREDENTIALS, p1)
    const second = await adapter.listCollections(CREDENTIALS, p2)
    expect([first.length, second.length]).toEqual([50, 10])
    expect([readUpstreamPage(p1)?.hasMore, readUpstreamPage(p2)?.hasMore]).toEqual([true, false])
    expect([...first, ...second].map((c) => c.id)).toEqual(tree.map((c) => String(c.Category.id)))
  })

  it('creates a category via postForm on categories/, wrapped as Category', async () => {
    const postForm = vi.spyOn(TrayCommerceClient.prototype, 'postForm').mockResolvedValue({ id: 456 })
    vi.spyOn(TrayCommerceClient.prototype, 'get').mockResolvedValue({
      Category: [{ Category: { id: 456, name: 'Categoria Teste' } }],
    })
    await adapter.createCollection(CREDENTIALS, { title: 'Categoria Teste' })
    expect(postForm).toHaveBeenCalledWith('categories/', 'Category', expect.objectContaining({ name: 'Categoria Teste' }))
  })

  it('lists Multi-CD locations from /multicd/distribution-centers, unwrapping `data`', async () => {
    const get = vi.spyOn(TrayCommerceClient.prototype, 'get').mockResolvedValue({
      paging: { number: 1, size: 10, total: 1 },
      data: [{ id: 351, name: 'D Eletrônicos', status: true }],
    })
    const locations = await adapter.listLocations(CREDENTIALS, {})
    expect(get).toHaveBeenCalledWith('multicd/distribution-centers')
    expect(locations).toEqual([expect.objectContaining({ id: '351', name: 'D Eletrônicos', active: true })])
  })

  it('gets a single Multi-CD location bare (no `data` wrapper) at /multicd/distribution-centers/:id', async () => {
    vi.spyOn(TrayCommerceClient.prototype, 'get').mockResolvedValue({ id: 351, name: 'D Eletrônicos', status: true })
    const location = await adapter.getLocation(CREDENTIALS, '351')
    expect(location.id).toBe('351')
  })

  it('reads inventory for a product across CDs from /multicd/stock/detailed/product/:id, selecting the matching dc', async () => {
    vi.spyOn(TrayCommerceClient.prototype, 'get').mockResolvedValue({
      data: [
        { dc_id: 1, stock: 7 },
        { dc_id: 3, stock: 99 },
      ],
    })
    const level = await adapter.getInventoryLevel?.(CREDENTIALS, '10:3')
    expect(level).toMatchObject({ id: '10:3', variantId: '10', locationId: '3', available: 99 })
  })

  it('sets inventory via a plain JSON PUT on /multicd/distribution-centers/:id/stock', async () => {
    const putJson = vi.spyOn(TrayCommerceClient.prototype, 'putJson').mockResolvedValue({ data: [] })
    vi.spyOn(TrayCommerceClient.prototype, 'get').mockResolvedValue({ data: [{ dc_id: 3, stock: 5 }] })
    await adapter.setInventoryLevel?.(CREDENTIALS, { variantId: '10', locationId: '3', available: 5 })
    expect(putJson).toHaveBeenCalledWith('multicd/distribution-centers/3/stock', { product_id: '10', stock: 5 })
  })

  it('creates a customer via postForm on /customers, wrapped as Customer', async () => {
    const postForm = vi.spyOn(TrayCommerceClient.prototype, 'postForm').mockResolvedValue({ id: 123 })
    vi.spyOn(TrayCommerceClient.prototype, 'get').mockResolvedValue({ Customer: { id: 123, name: 'Jane Doe' } })
    await adapter.createCustomer?.(CREDENTIALS, { firstName: 'Jane', lastName: 'Doe' })
    expect(postForm).toHaveBeenCalledWith('customers', 'Customer', expect.objectContaining({ name: 'Jane Doe' }))
  })

  it('deletes a customer on DELETE /customers/:id', async () => {
    const del = vi.spyOn(TrayCommerceClient.prototype, 'delete').mockResolvedValue(undefined)
    await adapter.deleteCustomer?.(CREDENTIALS, '123')
    expect(del).toHaveBeenCalledWith('customers/123')
  })

  it('gets an order from /orders/:id/complete (not the plain get) for the fully-detailed line-item shape', async () => {
    const get = vi
      .spyOn(TrayCommerceClient.prototype, 'get')
      .mockResolvedValue({ Order: { id: 42, status: 'FINALIZADO' } })
    const order = await adapter.getOrder(CREDENTIALS, '42')
    expect(get).toHaveBeenCalledWith('orders/42/complete')
    expect(order.fulfillmentStatus).toBe('FULFILLED')
  })

  it('creates an order via postForm on /orders, wrapped as Order', async () => {
    const postForm = vi.spyOn(TrayCommerceClient.prototype, 'postForm').mockResolvedValue({ id: 1167 })
    vi.spyOn(TrayCommerceClient.prototype, 'get').mockResolvedValue({ Order: { id: 1167, status: 'A ENVIAR' } })
    await adapter.createOrder?.(CREDENTIALS, { email: 'jane@acme.example' })
    expect(postForm).toHaveBeenCalledWith(
      'orders',
      'Order',
      expect.objectContaining({ Customer: expect.objectContaining({ email: 'jane@acme.example' }) }),
    )
  })

  it('updates an order via putForm on /orders/:id, wrapped as Order', async () => {
    const putForm = vi.spyOn(TrayCommerceClient.prototype, 'putForm').mockResolvedValue({})
    vi.spyOn(TrayCommerceClient.prototype, 'get').mockResolvedValue({ Order: { id: 42, status: 'A ENVIAR' } })
    await adapter.updateOrder?.(CREDENTIALS, '42', { note: 'Leave at front desk.' })
    expect(putForm).toHaveBeenCalledWith('orders/42', 'Order', { store_note: 'Leave at front desk.' })
  })

  it('cancels an order via a bodyless JSON PUT on /orders/cancel/:id (id BEFORE the verb)', async () => {
    const putJson = vi.spyOn(TrayCommerceClient.prototype, 'putJson').mockResolvedValue({})
    vi.spyOn(TrayCommerceClient.prototype, 'get').mockResolvedValue({ Order: { id: 42, status: 'FINALIZADO' } })
    const order = await adapter.cancelOrder(CREDENTIALS, '42')
    expect(putJson).toHaveBeenCalledWith('orders/cancel/42', undefined)
    expect(order.fulfillmentStatus).toBe('FULFILLED')
  })
})

describe('TrayCommerceAdapter — removed/never-implemented methods stay absent', () => {
  const adapter = new TrayCommerceAdapter(CONFIG)

  it('never declares discount, transaction, refund or fulfillment methods (see metadata.ts for why)', () => {
    const uncallable = adapter as unknown as Record<string, unknown>
    for (const method of [
      'listDiscounts',
      'getDiscount',
      'createDiscount',
      'updateDiscount',
      'deleteDiscount',
      'listTransactions',
      'getTransaction',
      'createTransaction',
      'listRefunds',
      'getRefund',
      'createRefund',
      'listFulfillments',
      'getFulfillment',
      'createFulfillment',
      'updateFulfillment',
      'cancelFulfillment',
    ]) {
      expect(uncallable[method]).toBeUndefined()
    }
  })
})
