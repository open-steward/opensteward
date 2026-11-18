import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  mapGoodsStatus,
  transformVariant,
  fenAsMinorUnits,
  unixToIso,
  type RawPddGoods,
  type RawPddSku,
} from '../../../../../../../src/verticals/ecommerce/adapters/pinduoduo/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSku(overrides: Partial<RawPddSku> = {}): RawPddSku {
  return {
    sku_id: '560001',
    outer_id: 'DRESS-RED-M',
    sku_price: 8900, // 89.00 CNY in fen
    sku_quantity: 120,
    spec: '颜色:大红色;尺码:M',
    is_onsale: 1,
    ...overrides,
  }
}

function makeGoods(overrides: Partial<RawPddGoods> = {}): RawPddGoods {
  return {
    goods_id: '9876543210',
    goods_name: '女士真丝连衣裙夏季新款气质优雅裙子',
    goods_desc: '100%桑蚕丝面料，轻盈透气，适合夏季穿着',
    image_url: [
      'https://img.pddpic.com/open-gw/2024-01-01/dress_main.jpg',
      'https://img.pddpic.com/open-gw/2024-01-01/dress_detail1.jpg',
      'https://img.pddpic.com/open-gw/2024-01-01/dress_detail2.jpg',
    ],
    thumb_url: 'https://img.pddpic.com/open-gw/2024-01-01/dress_thumb.jpg',
    is_onsale: 1,
    goods_status: 1,
    goods_type: '女装',
    sku_list: [
      makeSku(),
      makeSku({
        sku_id: '560002',
        outer_id: 'DRESS-RED-L',
        spec: '颜色:大红色;尺码:L',
        sku_quantity: 80,
      }),
      makeSku({
        sku_id: '560003',
        outer_id: 'DRESS-BLU-M',
        spec: '颜色:深蓝色;尺码:M',
        sku_price: 9500, // 95.00 CNY (different color at higher price)
        sku_quantity: 60,
      }),
    ],
    create_time: 1704067200, // 2024-01-01T00:00:00Z
    update_time: 1706745600, // 2024-02-01T00:00:00Z
    goods_url: 'https://mobile.yangkeduo.com/goods.html?goods_id=9876543210',
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('transformProduct (Pinduoduo)', () => {
  it('uses goods_id as the canonical id', () => {
    const result = transformProduct(makeGoods())
    expect(result.id).toBe('9876543210')
  })

  it('maps goods_name to canonical title', () => {
    const result = transformProduct(makeGoods())
    expect(result.title).toBe('女士真丝连衣裙夏季新款气质优雅裙子')
  })

  it('maps goods_desc to canonical description', () => {
    const result = transformProduct(makeGoods())
    expect(result.description).toBe('100%桑蚕丝面料，轻盈透气，适合夏季穿着')
  })

  it('maps is_onsale=1 to ACTIVE status', () => {
    const result = transformProduct(makeGoods({ is_onsale: 1 }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps is_onsale=0 to DRAFT status', () => {
    const result = transformProduct(makeGoods({ is_onsale: 0, goods_status: 0 }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps goods_status=-1 to ARCHIVED status (deleted)', () => {
    const result = transformProduct(makeGoods({ is_onsale: 0, goods_status: -1 }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps goods_type to productType', () => {
    const result = transformProduct(makeGoods())
    expect(result.productType).toBe('女装')
  })

  it('maps sku_list to variants array', () => {
    const result = transformProduct(makeGoods(), 'CNY')
    expect(result.variants).toHaveLength(3)
  })

  it('maps sku_id to variant id', () => {
    const result = transformProduct(makeGoods(), 'CNY')
    expect(result.variants![0]!.id).toBe('560001')
    expect(result.variants![1]!.id).toBe('560002')
    expect(result.variants![2]!.id).toBe('560003')
  })

  it('maps outer_id to variant sku', () => {
    const result = transformProduct(makeGoods(), 'CNY')
    expect(result.variants![0]!.sku).toBe('DRESS-RED-M')
  })

  it('maps spec to variant title', () => {
    const result = transformProduct(makeGoods(), 'CNY')
    expect(result.variants![0]!.title).toBe('颜色:大红色;尺码:M')
  })

  it('keeps sku_price in fen, the minor unit Money.amount requires', () => {
    const result = transformProduct(makeGoods(), 'CNY')
    // 8900 fen = 89.00 CNY
    expect(result.variants![0]!.price).toEqual({ amount: 8900, currency: 'CNY' })
    // 9500 fen = 95.00 CNY
    expect(result.variants![2]!.price).toEqual({ amount: 9500, currency: 'CNY' })
  })

  it('maps image_url array to images', () => {
    const result = transformProduct(makeGoods())
    expect(result.images).toBeDefined()
    expect(result.images).toHaveLength(3)
    expect(result.images![0]!.url).toBe(
      'https://img.pddpic.com/open-gw/2024-01-01/dress_main.jpg',
    )
    expect(result.images![0]!.position).toBe(0)
  })

  it('falls back to thumb_url when image_url is absent', () => {
    const result = transformProduct(makeGoods({ image_url: undefined }))
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe(
      'https://img.pddpic.com/open-gw/2024-01-01/dress_thumb.jpg',
    )
  })

  it('converts create_time and update_time Unix timestamps to ISO strings', () => {
    const result = transformProduct(makeGoods())
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-02-01T00:00:00.000Z')
  })

  it('stores the unmodified raw goods object in metadata', () => {
    const raw = makeGoods()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
    expect(result.metadata['goods_id']).toBe('9876543210')
  })

  it('produces a payload satisfying ProductSchema', () => {
    const result = transformProduct(makeGoods(), 'CNY')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('handles goods with no SKUs (variants becomes undefined)', () => {
    const result = transformProduct(makeGoods({ sku_list: [] }))
    expect(result.variants).toBeUndefined()
  })

  it('handles goods with no images (images becomes undefined)', () => {
    const result = transformProduct(
      makeGoods({ image_url: undefined, thumb_url: undefined }),
    )
    expect(result.images).toBeUndefined()
  })

  it('falls back to goods_id as title when goods_name is missing', () => {
    const result = transformProduct(makeGoods({ goods_name: undefined }))
    expect(result.title).toBe('9876543210')
  })

  it('handles missing status fields gracefully', () => {
    const result = transformProduct(
      makeGoods({ is_onsale: undefined, goods_status: undefined }),
    )
    expect(result.status).toBeUndefined()
  })

  it('defaults to CNY currency for variants', () => {
    const result = transformProduct(makeGoods())
    expect(result.variants![0]!.price.currency).toBe('CNY')
  })

  it('links each variant to the parent product id', () => {
    const result = transformProduct(makeGoods(), 'CNY')
    expect(result.variants![0]!.productId).toBe('9876543210')
    expect(result.variants![1]!.productId).toBe('9876543210')
  })
})

describe('mapGoodsStatus (Pinduoduo)', () => {
  it('returns ARCHIVED when goods_status is -1', () => {
    expect(mapGoodsStatus(0, -1)).toBe('ARCHIVED')
    expect(mapGoodsStatus(1, -1)).toBe('ARCHIVED')
  })

  it('returns ACTIVE when is_onsale is 1 and not deleted', () => {
    expect(mapGoodsStatus(1, 1)).toBe('ACTIVE')
    expect(mapGoodsStatus(1, undefined)).toBe('ACTIVE')
  })

  it('returns DRAFT when is_onsale is 0', () => {
    expect(mapGoodsStatus(0, 0)).toBe('DRAFT')
    expect(mapGoodsStatus(0, undefined)).toBe('DRAFT')
  })

  it('returns undefined when all fields are absent', () => {
    expect(mapGoodsStatus(undefined, undefined)).toBeUndefined()
  })
})

describe('fenAsMinorUnits (Pinduoduo)', () => {
  // Fen IS the minor unit of CNY, which is what canonical Money.amount wants,
  // so the value passes through. The previous helper divided by 100 and
  // reported every amount at 1/100th of its real value.
  it('passes fen through unchanged', () => {
    expect(fenAsMinorUnits(8900)).toBe(8900)
    expect(fenAsMinorUnits(9950)).toBe(9950)
    expect(fenAsMinorUnits(100)).toBe(100)
  })

  it('returns 0 for null/undefined/NaN', () => {
    expect(fenAsMinorUnits(undefined)).toBe(0)
    expect(fenAsMinorUnits(NaN)).toBe(0)
  })

  it('handles zero correctly', () => {
    expect(fenAsMinorUnits(0)).toBe(0)
  })
})

describe('unixToIso (Pinduoduo)', () => {
  it('converts Unix seconds timestamp to ISO 8601 string', () => {
    expect(unixToIso(1704067200)).toBe('2024-01-01T00:00:00.000Z')
  })

  it('returns undefined for zero or falsy input', () => {
    expect(unixToIso(0)).toBeUndefined()
    expect(unixToIso(undefined)).toBeUndefined()
  })
})

describe('transformVariant (Pinduoduo)', () => {
  it('maps sku_id to variant id', () => {
    const sku = makeSku({ sku_id: '999001' })
    const variant = transformVariant(sku, 'goods-123', 'CNY')
    expect(variant.id).toBe('999001')
  })

  it('links variant to parent productId', () => {
    const variant = transformVariant(makeSku(), 'goods-parent-001', 'CNY')
    expect(variant.productId).toBe('goods-parent-001')
  })

  it('stores raw SKU in metadata', () => {
    const sku = makeSku()
    const variant = transformVariant(sku, 'goods-123', 'CNY')
    expect(variant.metadata).toBe(sku)
  })

  it('keeps the fen price as minor units', () => {
    const sku = makeSku({ sku_price: 29900 })
    const variant = transformVariant(sku, 'goods-123', 'CNY')
    expect(variant.price).toEqual({ amount: 29900, currency: 'CNY' })
  })
})

describe('untransformProduct (Pinduoduo)', () => {
  it('maps canonical product back to PDD update payload', () => {
    const canonical = transformProduct(makeGoods(), 'CNY')
    const payload = untransformProduct(canonical)
    expect(payload.goods_id).toBeDefined()
    expect(payload.goods_name).toBe('女士真丝连衣裙夏季新款气质优雅裙子')
  })

  it('maps ACTIVE status to is_onsale=1', () => {
    const payload = untransformProduct({
      id: '1',
      title: 'T',
      status: 'ACTIVE',
      metadata: {},
    })
    expect(payload.is_onsale).toBe(1)
  })

  it('maps DRAFT status to is_onsale=0', () => {
    const payload = untransformProduct({
      id: '1',
      title: 'T',
      status: 'DRAFT',
      metadata: {},
    })
    expect(payload.is_onsale).toBe(0)
  })

  it('maps ARCHIVED status to is_onsale=0', () => {
    const payload = untransformProduct({
      id: '1',
      title: 'T',
      status: 'ARCHIVED',
      metadata: {},
    })
    expect(payload.is_onsale).toBe(0)
  })

  it('maps description to goods_desc', () => {
    const payload = untransformProduct({
      id: '1',
      title: 'T',
      description: '商品描述',
      metadata: {},
    })
    expect(payload.goods_desc).toBe('商品描述')
  })
})
