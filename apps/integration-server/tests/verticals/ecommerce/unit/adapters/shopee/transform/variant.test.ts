import { describe, it, expect } from 'vitest'
import {
  transformVariant,
  transformVariants,
  type RawShopeeModel,
  type RawShopeeTierVariation,
  type RawShopeeModelListResponse,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopee/transform/variant'
import { ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

const TIER_VARIATIONS: RawShopeeTierVariation[] = [
  {
    name: 'Color',
    option_list: [
      { option: 'Black' },
      { option: 'White' },
      { option: 'Blue' },
    ],
  },
  {
    name: 'Size',
    option_list: [
      { option: 'S' },
      { option: 'M' },
      { option: 'L' },
    ],
  },
]

function makeModel(overrides: Partial<RawShopeeModel> = {}): RawShopeeModel {
  return {
    model_id: 50001,
    model_sku: 'TEE-BLK-M',
    tier_index: [0, 1],
    price_info: [
      {
        currency: 'SGD',
        original_price: 29.9,
        current_price: 24.9,
      },
    ],
    ...overrides,
  }
}

describe('transformVariant (Shopee)', () => {
  it('uses model_id as the canonical id', () => {
    const result = transformVariant(makeModel(), 12345, TIER_VARIATIONS)
    expect(result.id).toBe('50001')
    expect(result.productId).toBe('12345')
  })

  it('maps tier_index to optionValues using tier_variation names', () => {
    const result = transformVariant(makeModel(), 12345, TIER_VARIATIONS)
    expect(result.optionValues).toEqual({ Color: 'Black', Size: 'M' })
  })

  it('builds a title from option values', () => {
    const result = transformVariant(makeModel(), 12345, TIER_VARIATIONS)
    expect(result.title).toBe('Black / M')
  })

  it('maps price info including compareAtPrice', () => {
    const result = transformVariant(makeModel(), 12345, TIER_VARIATIONS)
    expect(result.price).toEqual({ amount: 2490, currency: 'SGD' })
    expect(result.compareAtPrice).toEqual({ amount: 2990, currency: 'SGD' })
  })

  it('omits compareAtPrice when prices are equal', () => {
    const result = transformVariant(
      makeModel({
        price_info: [{ currency: 'SGD', original_price: 24.9, current_price: 24.9 }],
      }),
      12345,
      TIER_VARIATIONS,
    )
    expect(result.compareAtPrice).toBeUndefined()
  })

  it('surfaces model_sku as sku', () => {
    const result = transformVariant(makeModel(), 12345, TIER_VARIATIONS)
    expect(result.sku).toBe('TEE-BLK-M')
  })

  it('satisfies ProductVariantSchema', () => {
    const result = transformVariant(makeModel(), 12345, TIER_VARIATIONS)
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })

  it('handles missing tier_variations gracefully', () => {
    const result = transformVariant(makeModel(), 12345, undefined)
    expect(result.optionValues).toBeUndefined()
    expect(result.title).toBe('Model 50001')
  })

  it('falls back to Model {id} title when no option values', () => {
    const result = transformVariant(
      makeModel({ tier_index: undefined }),
      12345,
      TIER_VARIATIONS,
    )
    expect(result.title).toBe('Model 50001')
  })
})

describe('transformVariants (Shopee)', () => {
  it('transforms all models in the response', () => {
    const response: RawShopeeModelListResponse = {
      tier_variation: TIER_VARIATIONS,
      model: [
        makeModel({ model_id: 50001, tier_index: [0, 0], model_sku: 'TEE-BLK-S' }),
        makeModel({ model_id: 50002, tier_index: [0, 1], model_sku: 'TEE-BLK-M' }),
        makeModel({ model_id: 50003, tier_index: [1, 2], model_sku: 'TEE-WHT-L' }),
      ],
    }
    const result = transformVariants(response, 12345)
    expect(result).toHaveLength(3)
    expect(result[0]!.optionValues).toEqual({ Color: 'Black', Size: 'S' })
    expect(result[2]!.optionValues).toEqual({ Color: 'White', Size: 'L' })
  })

  it('returns empty array for no models', () => {
    const result = transformVariants({}, 12345)
    expect(result).toEqual([])
  })
})
