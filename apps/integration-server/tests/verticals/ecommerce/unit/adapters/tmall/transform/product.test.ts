import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  mapProductStatus,
  transformVariant,
  parseTmallPrice,
  transformOnsaleItem,
  ONSALE_ITEM_FIELDS,
  type RawTmallItem,
  type RawTmallOnsaleItem,
  type RawTmallSku,
} from '../../../../../../../src/verticals/ecommerce/adapters/tmall/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSku(overrides: Partial<RawTmallSku> = {}): RawTmallSku {
  return {
    sku_id: '88001',
    outer_id: 'COAT-BLK-L',
    properties: '1627207:28326',
    properties_name: '颜色分类:黑色;尺码:L',
    quantity: 45,
    price: '399.00',
    modified: '2024-09-10T08:00:00.000Z',
    status: 'normal',
    ...overrides,
  }
}

function makeItem(overrides: Partial<RawTmallItem> = {}): RawTmallItem {
  return {
    num_iid: '12345678901',
    title: '李宁男款羽绒服冬季保暖外套',
    desc: '<p>李宁品牌羽绒服，填充量90%白鸭绒，保暖舒适</p>',
    price: '399.00',
    approve_status: 'onsale',
    created: '2024-08-01T10:00:00.000Z',
    modified: '2024-09-15T14:30:00.000Z',
    type: '服装',
    pic_url: 'https://img.alicdn.com/imgextra/i1/main.jpg',
    detail_url: 'https://item.taobao.com/item.htm?id=12345678901',
    sku: [
      makeSku(),
      makeSku({
        sku_id: '88002',
        outer_id: 'COAT-BLK-XL',
        properties_name: '颜色分类:黑色;尺码:XL',
        quantity: 30,
        price: '399.00',
      }),
      makeSku({
        sku_id: '88003',
        outer_id: 'COAT-WHT-L',
        properties_name: '颜色分类:白色;尺码:L',
        quantity: 15,
        price: '419.00',
      }),
    ],
    item_imgs: [
      { url: 'https://img.alicdn.com/imgextra/i2/alt1.jpg', position: 1 },
      { url: 'https://img.alicdn.com/imgextra/i3/alt2.jpg', position: 2 },
    ],
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('transformProduct (Tmall)', () => {
  it('uses num_iid as the canonical id', () => {
    const result = transformProduct(makeItem())
    expect(result.id).toBe('12345678901')
  })

  it('maps title to canonical title', () => {
    const result = transformProduct(makeItem())
    expect(result.title).toBe('李宁男款羽绒服冬季保暖外套')
  })

  it('maps desc to canonical description', () => {
    const result = transformProduct(makeItem())
    expect(result.description).toBe('<p>李宁品牌羽绒服，填充量90%白鸭绒，保暖舒适</p>')
  })

  it('maps approve_status onsale to ACTIVE', () => {
    const result = transformProduct(makeItem({ approve_status: 'onsale' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps approve_status instock to DRAFT', () => {
    const result = transformProduct(makeItem({ approve_status: 'instock' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps approve_status delete to ARCHIVED', () => {
    const result = transformProduct(makeItem({ approve_status: 'delete' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps type to productType', () => {
    const result = transformProduct(makeItem())
    expect(result.productType).toBe('服装')
  })

  it('maps SKUs to variants', () => {
    const result = transformProduct(makeItem(), 'CNY')
    expect(result.variants).toHaveLength(3)
  })

  it('maps SKU sku_id to variant id', () => {
    const result = transformProduct(makeItem(), 'CNY')
    expect(result.variants![0]!.id).toBe('88001')
    expect(result.variants![1]!.id).toBe('88002')
    expect(result.variants![2]!.id).toBe('88003')
  })

  it('maps SKU outer_id to variant sku', () => {
    const result = transformProduct(makeItem(), 'CNY')
    expect(result.variants![0]!.sku).toBe('COAT-BLK-L')
  })

  it('maps SKU properties_name to variant title', () => {
    const result = transformProduct(makeItem(), 'CNY')
    expect(result.variants![0]!.title).toBe('颜色分类:黑色;尺码:L')
  })

  it('maps SKU price with currency', () => {
    const result = transformProduct(makeItem(), 'CNY')
    expect(result.variants![0]!.price).toEqual({ amount: 39900, currency: 'CNY' })
    expect(result.variants![2]!.price).toEqual({ amount: 41900, currency: 'CNY' })
  })

  it('prepends pic_url as position 0 image', () => {
    const result = transformProduct(makeItem())
    expect(result.images).toBeDefined()
    expect(result.images![0]).toMatchObject({
      url: 'https://img.alicdn.com/imgextra/i1/main.jpg',
      position: 0,
    })
  })

  it('includes item_imgs after the main image', () => {
    const result = transformProduct(makeItem())
    expect(result.images).toHaveLength(3)
    expect(result.images![1]).toMatchObject({
      url: 'https://img.alicdn.com/imgextra/i2/alt1.jpg',
    })
    expect(result.images![2]).toMatchObject({
      url: 'https://img.alicdn.com/imgextra/i3/alt2.jpg',
    })
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformProduct(makeItem())
    expect(result.createdAt).toBe('2024-08-01T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-09-15T14:30:00.000Z')
  })

  it('stores the unmodified raw object in metadata', () => {
    const raw = makeItem()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
    expect(result.metadata['num_iid']).toBe('12345678901')
  })

  it('produces a payload satisfying ProductSchema', () => {
    const result = transformProduct(makeItem(), 'CNY')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('handles items with no SKUs', () => {
    const result = transformProduct(makeItem({ sku: [] }))
    expect(result.variants).toBeUndefined()
  })

  it('handles items with no images', () => {
    const result = transformProduct(makeItem({ pic_url: undefined, item_imgs: [] }))
    expect(result.images).toBeUndefined()
  })

  it('handles missing approve_status gracefully', () => {
    const result = transformProduct(makeItem({ approve_status: undefined }))
    expect(result.status).toBeUndefined()
  })

  it('falls back to num_iid as title when title is missing', () => {
    const result = transformProduct(makeItem({ title: undefined }))
    expect(result.title).toBe('12345678901')
  })

  it('defaults to CNY currency', () => {
    const result = transformProduct(makeItem())
    expect(result.variants![0]!.price.currency).toBe('CNY')
  })
})

describe('mapProductStatus (Tmall)', () => {
  it('returns undefined for unknown statuses', () => {
    expect(mapProductStatus('pending')).toBeUndefined()
    expect(mapProductStatus(undefined)).toBeUndefined()
    expect(mapProductStatus('')).toBeUndefined()
  })

  it('is case-insensitive', () => {
    expect(mapProductStatus('ONSALE')).toBe('ACTIVE')
    expect(mapProductStatus('Instock')).toBe('DRAFT')
  })
})

describe('parseTmallPrice', () => {
  it('parses decimal price strings', () => {
    expect(parseTmallPrice('199.00')).toBe(199)
    expect(parseTmallPrice('1299.99')).toBe(1299.99)
  })

  it('handles numeric input', () => {
    expect(parseTmallPrice(299)).toBe(299)
  })

  it('returns 0 for null/undefined/invalid', () => {
    expect(parseTmallPrice(undefined)).toBe(0)
    expect(parseTmallPrice('abc')).toBe(0)
  })
})

describe('transformVariant (Tmall)', () => {
  it('maps sku_id to variant id', () => {
    const sku = makeSku({ sku_id: '99999' })
    const variant = transformVariant(sku, 'prod1', 'CNY')
    expect(variant.id).toBe('99999')
  })

  it('stores raw SKU in metadata', () => {
    const sku = makeSku()
    const variant = transformVariant(sku, 'prod1', 'CNY')
    expect(variant.metadata).toBe(sku)
  })

  it('links variant to parent productId', () => {
    const variant = transformVariant(makeSku(), 'PARENT-001', 'CNY')
    expect(variant.productId).toBe('PARENT-001')
  })
})

describe('untransformProduct (Tmall)', () => {
  it('maps canonical product back to TOP update payload', () => {
    const canonical = transformProduct(makeItem(), 'CNY')
    const payload = untransformProduct(canonical)
    expect(payload.num_iid).toBeDefined()
    expect(payload.title).toBe('李宁男款羽绒服冬季保暖外套')
  })

  it('maps ACTIVE status to onsale', () => {
    const payload = untransformProduct({ id: '1', title: 'T', status: 'ACTIVE', metadata: {} })
    expect(payload.approve_status).toBe('onsale')
  })

  it('maps DRAFT status to instock', () => {
    const payload = untransformProduct({ id: '1', title: 'T', status: 'DRAFT', metadata: {} })
    expect(payload.approve_status).toBe('instock')
  })

  it('maps ARCHIVED status to delete', () => {
    const payload = untransformProduct({ id: '1', title: 'T', status: 'ARCHIVED', metadata: {} })
    expect(payload.approve_status).toBe('delete')
  })

  it('maps first variant price to price field', () => {
    const canonical = transformProduct(makeItem(), 'CNY')
    const payload = untransformProduct(canonical)
    expect(payload.price).toBe('399.00')
  })
})

// ── taobao.items.onsale.get (docId 18) ────────────────────────────────────────

// From the documented example of items_onsale_get_response.items.item[0],
// trimmed to the fields the adapter requests.
function docOnsaleItem(overrides: Partial<RawTmallOnsaleItem> = {}): RawTmallOnsaleItem {
  return {
    approve_status: 'onsale',
    num_iid: 1489161932,
    title: 'Google test item',
    pic_url: 'http://img03.taobao.net/bao/uploaded/i3/T1HXdXXgPSt0JxZ2.8_070458.jpg',
    list_time: '2009-10-22 14:22:06',
    modified: '2000-01-01 00:00:00',
    ...overrides,
  }
}

describe('transformOnsaleItem (Tmall)', () => {
  it('maps the documented example and satisfies ProductSchema', () => {
    const p = ProductSchema.parse(transformOnsaleItem(docOnsaleItem()))
    expect(p).toMatchObject({
      id: '1489161932',
      title: 'Google test item',
      status: 'ACTIVE',
      images: [
        {
          url: 'http://img03.taobao.net/bao/uploaded/i3/T1HXdXXgPSt0JxZ2.8_070458.jpg',
          position: 0,
        },
      ],
      publishedAt: '2009-10-22T14:22:06.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
    })
    expect(p.metadata).toEqual(docOnsaleItem())
    expect(p.variants).toBeUndefined()
  })

  it('maps instock to DRAFT and omits images without pic_url', () => {
    const p = ProductSchema.parse(
      transformOnsaleItem(docOnsaleItem({ approve_status: 'instock', pic_url: undefined })),
    )
    expect(p.status).toBe('DRAFT')
    expect(p.images).toBeUndefined()
  })

  it('throws without num_iid or title rather than inventing them', () => {
    expect(() => transformOnsaleItem(docOnsaleItem({ num_iid: undefined }))).toThrow(/num_iid/)
    expect(() => transformOnsaleItem(docOnsaleItem({ title: undefined }))).toThrow(/title/)
  })

  it('requests only fields taobao.items.onsale.get documents', () => {
    const documented = new Set(
      (
        'approve_status,num_iid,title,nick,type,cid,pic_url,num,props,valid_thru,list_time,price,' +
        'has_discount,has_invoice,has_warranty,has_showcase,modified,delist_time,postage_id,' +
        'seller_cids,outer_id,sold_quantity'
      ).split(','),
    )
    for (const f of ONSALE_ITEM_FIELDS.split(',')) expect(documented.has(f)).toBe(true)
  })
})
