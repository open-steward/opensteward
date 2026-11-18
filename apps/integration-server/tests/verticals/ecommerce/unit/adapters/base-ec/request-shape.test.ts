/**
 * BASE HTTP request shape (method, path, headers, body) and page/limit →
 * limit/offset pagination.
 * Docs: https://docs.thebase.in/api/ , https://docs.thebase.in/api/items ,
 * https://docs.thebase.in/api/orders
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { BaseEcAdapter } from '../../../../../../src/verticals/ecommerce/adapters/base-ec/index'

const CFG = { clientId: 'cid', clientSecret: 'sec', redirectUri: 'https://app.example/callback' }
const CREDS = { accessToken: 'tok' }

interface Call {
  method: 'get' | 'post'
  path: string
  params?: Record<string, unknown>
  body?: string
}

function fakeBase(answer: (call: Call) => unknown) {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const call: Call = { method: 'get', path, params: cfg?.params }
    calls.push(call)
    return { data: answer(call) }
  })
  const post = vi.fn(async (path: string, body?: unknown) => {
    const call: Call = { method: 'post', path, body: body instanceof URLSearchParams ? body.toString() : String(body) }
    calls.push(call)
    return { data: answer(call) }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post, defaults: { headers: {} } } as never)
  return { calls, get, post }
}

afterEach(() => vi.restoreAllMocks())

describe('client construction', () => {
  it('sends the Bearer token as an Authorization header against the global API host', async () => {
    fakeBase(() => ({ items: [] }))
    const adapter = new BaseEcAdapter(CFG)
    await adapter.listProducts(CREDS, {})
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://api.thebase.in/1',
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
      }),
    )
  })
})

describe('products', () => {
  it('listProducts sends limit/offset derived from page, and maps the envelope', async () => {
    const { get } = fakeBase(() => ({
      items: [{ item_id: 1, title: 'T', price: 100, stock: 1 }],
    }))
    const adapter = new BaseEcAdapter(CFG)
    const result = await adapter.listProducts(CREDS, { page: 3, limit: 20 })
    expect(get).toHaveBeenCalledWith('items/', { params: { limit: 20, offset: 40 } })
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('1')
  })

  it('clamps limit to MAX_PAGE_SIZE (100)', async () => {
    const { get } = fakeBase(() => ({ items: [] }))
    const adapter = new BaseEcAdapter(CFG)
    await adapter.listProducts(CREDS, { limit: 500 })
    expect(get).toHaveBeenCalledWith('items/', { params: { limit: 100, offset: 0 } })
  })

  it('getProduct GETs items/detail/:id', async () => {
    const { get } = fakeBase(() => ({ item: { item_id: 42, title: 'X', price: 1, stock: 1 } }))
    const adapter = new BaseEcAdapter(CFG)
    await adapter.getProduct(CREDS, '42')
    expect(get).toHaveBeenCalledWith('items/detail/42', { params: undefined })
  })

  it('createProduct POSTs a form-urlencoded body to items/add', async () => {
    const { post } = fakeBase(() => ({ item: { item_id: 1, title: 'T', price: 100, stock: 1 } }))
    const adapter = new BaseEcAdapter(CFG)
    await adapter.createProduct(CREDS, {
      title: 'T',
      variants: [{ id: 'v', price: { amount: 100, currency: 'JPY' }, metadata: { stock: 5 } }],
    })
    expect(post).toHaveBeenCalledTimes(1)
    const [path, body] = post.mock.calls[0]!
    expect(path).toBe('items/add')
    const params = new URLSearchParams(body as string)
    expect(params.get('title')).toBe('T')
    expect(params.get('price')).toBe('100')
    expect(params.get('stock')).toBe('5')
  })

  it('updateProduct POSTs item_id + fields to items/edit', async () => {
    const { post } = fakeBase(() => ({ item: { item_id: 1, title: 'T2', price: 200, stock: 1 } }))
    const adapter = new BaseEcAdapter(CFG)
    await adapter.updateProduct(CREDS, '1', {
      title: 'T2',
      variants: [{ id: 'v', price: { amount: 200, currency: 'JPY' }, metadata: { stock: 3 } }],
    })
    const [path, body] = post.mock.calls[0]!
    expect(path).toBe('items/edit')
    const params = new URLSearchParams(body as string)
    expect(params.get('item_id')).toBe('1')
    expect(params.get('title')).toBe('T2')
  })

  it('deleteProduct POSTs item_id to items/delete', async () => {
    const { post } = fakeBase(() => ({}))
    const adapter = new BaseEcAdapter(CFG)
    await adapter.deleteProduct(CREDS, '7')
    const [path, body] = post.mock.calls[0]!
    expect(path).toBe('items/delete')
    expect(new URLSearchParams(body as string).get('item_id')).toBe('7')
  })

  it('deleteVariant splits the composite id and POSTs to items/delete_variation', async () => {
    const { post } = fakeBase(() => ({}))
    const adapter = new BaseEcAdapter(CFG)
    await adapter.deleteVariant(CREDS, '1234:11')
    const [path, body] = post.mock.calls[0]!
    expect(path).toBe('items/delete_variation')
    const params = new URLSearchParams(body as string)
    expect(params.get('item_id')).toBe('1234')
    expect(params.get('variation_id')).toBe('11')
  })

  it('deleteVariant rejects a malformed id', async () => {
    fakeBase(() => ({}))
    const adapter = new BaseEcAdapter(CFG)
    await expect(adapter.deleteVariant(CREDS, '1234')).rejects.toThrow(/invalid id/)
  })
})

describe('collections', () => {
  it('listCollections GETs categories/', async () => {
    const { get } = fakeBase(() => ({ categories: [{ category_id: 1, name: 'A' }] }))
    const adapter = new BaseEcAdapter(CFG)
    const result = await adapter.listCollections(CREDS, {})
    expect(get).toHaveBeenCalledWith('categories/', { params: undefined })
    expect(result).toEqual([{ id: '1', title: 'A', metadata: { category_id: 1, name: 'A' } }])
  })

  it('getCollection finds the category by id from the list', async () => {
    fakeBase(() => ({ categories: [{ category_id: 1, name: 'A' }, { category_id: 2, name: 'B' }] }))
    const adapter = new BaseEcAdapter(CFG)
    const result = await adapter.getCollection(CREDS, '2')
    expect(result.title).toBe('B')
  })

  it('getCollection throws when the id is not found', async () => {
    fakeBase(() => ({ categories: [] }))
    const adapter = new BaseEcAdapter(CFG)
    await expect(adapter.getCollection(CREDS, '99')).rejects.toThrow(/not found/)
  })

  it('createCollection POSTs to categories/add', async () => {
    const { post } = fakeBase(() => ({ categories: [{ category_id: 1, name: 'New' }] }))
    const adapter = new BaseEcAdapter(CFG)
    const result = await adapter.createCollection(CREDS, { title: 'New' })
    const [path, body] = post.mock.calls[0]!
    expect(path).toBe('categories/add')
    expect(new URLSearchParams(body as string).get('name')).toBe('New')
    expect(result.id).toBe('1')
  })

  it('deleteCollection POSTs category_id to categories/delete', async () => {
    const { post } = fakeBase(() => ({}))
    const adapter = new BaseEcAdapter(CFG)
    await adapter.deleteCollection(CREDS, '5')
    const [path, body] = post.mock.calls[0]!
    expect(path).toBe('categories/delete')
    expect(new URLSearchParams(body as string).get('category_id')).toBe('5')
  })
})

describe('orders', () => {
  it('listOrders sends limit/offset to orders/', async () => {
    const { get } = fakeBase(() => ({ orders: [] }))
    const adapter = new BaseEcAdapter(CFG)
    await adapter.listOrders(CREDS, { page: 2, limit: 20 })
    expect(get).toHaveBeenCalledWith('orders/', { params: { limit: 20, offset: 20 } })
  })

  it('getOrder GETs orders/detail/:id', async () => {
    const { get } = fakeBase(() => ({ order: { unique_key: 'k1', order_items: [] } }))
    const adapter = new BaseEcAdapter(CFG)
    await adapter.getOrder(CREDS, 'k1')
    expect(get).toHaveBeenCalledWith('orders/detail/k1', { params: undefined })
  })

  it('cancelOrder posts edit_status once per still-ordered line item, then re-fetches', async () => {
    let fetches = 0
    const { post, get } = fakeBase((call) => {
      if (call.method === 'get') {
        fetches += 1
        return {
          order: {
            unique_key: 'k1',
            order_items: [
              { order_item_id: 'a', item_id: 1, title: 'T', price: 100, amount: 1, status: 'ordered' },
              { order_item_id: 'b', item_id: 1, title: 'T', price: 100, amount: 1, status: 'dispatched' },
            ],
          },
        }
      }
      return {}
    })
    const adapter = new BaseEcAdapter(CFG)
    await adapter.cancelOrder(CREDS, 'k1')
    expect(get).toHaveBeenCalledTimes(2) // fetch before + fetch after
    expect(post).toHaveBeenCalledTimes(1) // only the still-`ordered` item
    const [path, body] = post.mock.calls[0]!
    expect(path).toBe('orders/edit_status')
    const params = new URLSearchParams(body as string)
    expect(params.get('order_item_id')).toBe('a')
    expect(params.get('status')).toBe('cancelled')
    expect(fetches).toBe(2)
  })
})
