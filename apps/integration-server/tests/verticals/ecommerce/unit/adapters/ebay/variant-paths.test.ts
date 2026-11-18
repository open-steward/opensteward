/**
 * Pins the requests behind ecommerce/ebay:variant.
 *
 * Before this, listVariants/getVariant/createVariant/updateVariant/
 * deleteVariant did not exist on the eBay adapter at all — the router
 * returned 501 for every one of them. Per the Sell Inventory API
 * (inventory_item is the purchasable SKU; inventory_item_group is the
 * parent "product with options" tying SKUs together as variants, with no
 * unscoped list of its own):
 *
 *   listVariants  requires `productId` (the inventoryItemGroupKey):
 *                 GET /sell/inventory/v1/inventory_item_group/{key}, then
 *                 GET /sell/inventory/v1/inventory_item/{sku} per variantSKU.
 *   getVariant    GET /sell/inventory/v1/inventory_item/{sku}.
 *   createVariant PUT /sell/inventory/v1/inventory_item/{sku}, then adds the
 *                 sku to the group's membership via PUT on the group.
 *   updateVariant PUT /sell/inventory/v1/inventory_item/{sku} only.
 *   deleteVariant GET the item to learn its group, PUT the group with the
 *                 sku removed from membership, then DELETE the item.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { EbayAdapter } from '../../../../../../src/verticals/ecommerce/adapters/ebay/index'
import { ProductVariantSchema } from '../../../../../../src/verticals/ecommerce/schema/product'

const CFG = { clientId: 'cid', clientSecret: 'sec' }
const CREDS = { accessToken: 'tok', extra: {} }

interface Call {
  method: 'get' | 'put' | 'delete'
  path: string
  params?: Record<string, unknown>
  body?: unknown
}

function fakeHttp(handlers: {
  get?: (path: string, params?: Record<string, unknown>) => unknown
  put?: (path: string, body?: unknown) => unknown
  del?: (path: string) => unknown
}) {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    calls.push({ method: 'get', path, params: cfg?.params })
    return { data: handlers.get ? handlers.get(path, cfg?.params) : {} }
  })
  const put = vi.fn(async (path: string, body?: unknown) => {
    calls.push({ method: 'put', path, body })
    return { data: handlers.put ? handlers.put(path, body) : {} }
  })
  const del = vi.fn(async (path: string) => {
    calls.push({ method: 'delete', path })
    return { data: handlers.del ? handlers.del(path) : {} }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, put, delete: del } as never)
  return { calls }
}

afterEach(() => vi.restoreAllMocks())

const GROUP = {
  inventoryItemGroupKey: 'GROUP-001',
  title: 'Stainless Steel Widget',
  variantSKUs: ['WIDGET-001-BLK', 'WIDGET-001-WHT'],
}

function item(sku: string) {
  return {
    sku,
    product: { title: `Widget (${sku})` },
    inventoryItemGroupKeys: ['GROUP-001'],
  }
}

describe('listVariants', () => {
  it('rejects with a 400 when productId is missing', async () => {
    const { calls } = fakeHttp({})
    await expect(new EbayAdapter(CFG).listVariants(CREDS, {} as never)).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(calls).toHaveLength(0)
  })

  it('GETs the group by key, then GETs inventory_item per variantSKU — not inventory_item_group as a collection', async () => {
    const { calls } = fakeHttp({
      get: (path) => {
        if (path === '/sell/inventory/v1/inventory_item_group/GROUP-001') return GROUP
        if (path === '/sell/inventory/v1/inventory_item/WIDGET-001-BLK') return item('WIDGET-001-BLK')
        if (path === '/sell/inventory/v1/inventory_item/WIDGET-001-WHT') return item('WIDGET-001-WHT')
        throw new Error(`unexpected GET ${path}`)
      },
    })
    const out = await new EbayAdapter(CFG).listVariants(CREDS, { productId: 'GROUP-001' } as never)

    expect(calls[0]).toMatchObject({
      method: 'get',
      path: '/sell/inventory/v1/inventory_item_group/GROUP-001',
    })
    const itemCalls = calls.slice(1)
    expect(itemCalls.map((c) => c.path).sort()).toEqual([
      '/sell/inventory/v1/inventory_item/WIDGET-001-BLK',
      '/sell/inventory/v1/inventory_item/WIDGET-001-WHT',
    ])

    expect(out).toHaveLength(2)
    for (const v of out) {
      expect(() => ProductVariantSchema.parse(v)).not.toThrow()
      expect(v.productId).toBe('GROUP-001')
    }
  })

  it('accepts snake_case product_id too', async () => {
    const { calls } = fakeHttp({
      get: (path) => {
        if (path === '/sell/inventory/v1/inventory_item_group/GROUP-001') return { ...GROUP, variantSKUs: [] }
        throw new Error(`unexpected GET ${path}`)
      },
    })
    await new EbayAdapter(CFG).listVariants(CREDS, { product_id: 'GROUP-001' } as never)
    expect(calls[0]!.path).toBe('/sell/inventory/v1/inventory_item_group/GROUP-001')
  })
})

describe('getVariant', () => {
  it('GETs /inventory_item/{sku}, not the group, and takes productId from inventoryItemGroupKeys', async () => {
    const { calls } = fakeHttp({
      get: (path) => {
        if (path === '/sell/inventory/v1/inventory_item/WIDGET-001-BLK') return item('WIDGET-001-BLK')
        throw new Error(`unexpected GET ${path}`)
      },
    })
    const v = await new EbayAdapter(CFG).getVariant(CREDS, 'WIDGET-001-BLK')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe('/sell/inventory/v1/inventory_item/WIDGET-001-BLK')
    expect(v.id).toBe('WIDGET-001-BLK')
    expect(v.productId).toBe('GROUP-001')
    expect(() => ProductVariantSchema.parse(v)).not.toThrow()
  })
})

describe('createVariant', () => {
  it('rejects with 400 when productId is missing', async () => {
    fakeHttp({})
    await expect(
      new EbayAdapter(CFG).createVariant(CREDS, { sku: 'NEW-SKU' } as never),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects with 400 when sku is missing', async () => {
    fakeHttp({})
    await expect(
      new EbayAdapter(CFG).createVariant(CREDS, { productId: 'GROUP-001' } as never),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('PUTs the inventory_item, then adds the sku to the group membership via PUT on the group', async () => {
    const { calls } = fakeHttp({
      get: (path) => {
        if (path === '/sell/inventory/v1/inventory_item_group/GROUP-001') return GROUP
        if (path === '/sell/inventory/v1/inventory_item/NEW-SKU') return item('NEW-SKU')
        throw new Error(`unexpected GET ${path}`)
      },
    })
    const v = await new EbayAdapter(CFG).createVariant(CREDS, {
      productId: 'GROUP-001',
      sku: 'NEW-SKU',
      title: 'New Widget',
    } as never)

    expect(calls[0]).toMatchObject({ method: 'put', path: '/sell/inventory/v1/inventory_item/NEW-SKU' })
    expect(calls[1]).toMatchObject({
      method: 'get',
      path: '/sell/inventory/v1/inventory_item_group/GROUP-001',
    })
    const groupPut = calls[2]
    expect(groupPut).toMatchObject({ method: 'put', path: '/sell/inventory/v1/inventory_item_group/GROUP-001' })
    expect((groupPut!.body as { variantSKUs: string[] }).variantSKUs).toEqual([
      'WIDGET-001-BLK',
      'WIDGET-001-WHT',
      'NEW-SKU',
    ])
    expect(v.id).toBe('NEW-SKU')
  })

  it('does not PUT the group again when the sku is already a member', async () => {
    const { calls } = fakeHttp({
      get: (path) => {
        if (path === '/sell/inventory/v1/inventory_item_group/GROUP-001') return GROUP
        if (path === '/sell/inventory/v1/inventory_item/WIDGET-001-BLK') return item('WIDGET-001-BLK')
        throw new Error(`unexpected GET ${path}`)
      },
    })
    await new EbayAdapter(CFG).createVariant(CREDS, {
      productId: 'GROUP-001',
      sku: 'WIDGET-001-BLK',
    } as never)
    const groupPuts = calls.filter((c) => c.method === 'put' && c.path.includes('inventory_item_group'))
    expect(groupPuts).toHaveLength(0)
  })
})

describe('updateVariant', () => {
  it('PUTs only the inventory_item — no group call', async () => {
    const { calls } = fakeHttp({
      get: (path) => {
        if (path === '/sell/inventory/v1/inventory_item/WIDGET-001-BLK') return item('WIDGET-001-BLK')
        throw new Error(`unexpected GET ${path}`)
      },
    })
    const v = await new EbayAdapter(CFG).updateVariant(CREDS, 'WIDGET-001-BLK', {
      title: 'Updated title',
    } as never)
    expect(calls[0]).toMatchObject({ method: 'put', path: '/sell/inventory/v1/inventory_item/WIDGET-001-BLK' })
    expect(calls.some((c) => c.path.includes('inventory_item_group'))).toBe(false)
    expect(v.id).toBe('WIDGET-001-BLK')
  })
})

describe('deleteVariant', () => {
  it('learns the group from the item, PUTs the group with membership removed, then DELETEs the item', async () => {
    const { calls } = fakeHttp({
      get: (path) => {
        if (path === '/sell/inventory/v1/inventory_item/WIDGET-001-BLK') return item('WIDGET-001-BLK')
        if (path === '/sell/inventory/v1/inventory_item_group/GROUP-001') return GROUP
        throw new Error(`unexpected GET ${path}`)
      },
    })
    await new EbayAdapter(CFG).deleteVariant(CREDS, 'WIDGET-001-BLK')

    expect(calls[0]).toMatchObject({ method: 'get', path: '/sell/inventory/v1/inventory_item/WIDGET-001-BLK' })
    expect(calls[1]).toMatchObject({
      method: 'get',
      path: '/sell/inventory/v1/inventory_item_group/GROUP-001',
    })
    const groupPut = calls[2]
    expect(groupPut).toMatchObject({ method: 'put', path: '/sell/inventory/v1/inventory_item_group/GROUP-001' })
    expect((groupPut!.body as { variantSKUs: string[] }).variantSKUs).toEqual(['WIDGET-001-WHT'])
    const del = calls[3]
    expect(del).toMatchObject({ method: 'delete', path: '/sell/inventory/v1/inventory_item/WIDGET-001-BLK' })
  })

  it('skips the group PUT when the item belongs to no group, and still deletes the item', async () => {
    const { calls } = fakeHttp({
      get: (path) => {
        if (path === '/sell/inventory/v1/inventory_item/LONER-SKU')
          return { sku: 'LONER-SKU', product: { title: 'Loner' } }
        throw new Error(`unexpected GET ${path}`)
      },
    })
    await new EbayAdapter(CFG).deleteVariant(CREDS, 'LONER-SKU')
    expect(calls.map((c) => c.method)).toEqual(['get', 'delete'])
  })
})
