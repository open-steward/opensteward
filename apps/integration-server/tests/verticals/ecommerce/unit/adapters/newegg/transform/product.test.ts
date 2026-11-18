import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawNeweggItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/newegg/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeItem(overrides: Partial<RawNeweggItem> = {}): RawNeweggItem {
  return {
    NeweggItemNumber: '9SIAABC12345',
    SellerPartNumber: 'GPU-RTX4090-24G',
    UPCCode: '012345678901',
    ManufacturerPartNumber: 'RTX4090-FE',
    Title: 'NVIDIA GeForce RTX 4090 Founders Edition 24GB GDDR6X',
    Description: '<p>Ultimate gaming GPU with Ada Lovelace architecture.</p>',
    MfrName: 'NVIDIA',
    SubCategoryID: 48,
    SubCategoryName: 'Desktop Graphics Cards',
    Condition: 'New',
    Active: true,
    SellingPrice: 1599.99,
    Currency: 'USD',
    ImageUrl: 'https://c1.neweggimages.com/productimage/rtx4090-main.jpg',
    AdditionalImageUrls: [
      'https://c1.neweggimages.com/productimage/rtx4090-side.jpg',
      'https://c1.neweggimages.com/productimage/rtx4090-back.jpg',
    ],
    Inventory: 25,
    Weight: 4.5,
    ...overrides,
  }
}

describe('transformProduct (Newegg)', () => {
  it('uses the Newegg Item Number as the canonical id', () => {
    const result = transformProduct(makeItem())
    expect(result.id).toBe('9SIAABC12345')
    expect(result.title).toBe('NVIDIA GeForce RTX 4090 Founders Edition 24GB GDDR6X')
  })

  it('falls back to SellerPartNumber when NeweggItemNumber is missing', () => {
    const result = transformProduct(makeItem({ NeweggItemNumber: undefined }))
    expect(result.id).toBe('GPU-RTX4090-24G')
  })

  it('surfaces MfrName as vendor and SubCategoryName as productType', () => {
    const result = transformProduct(makeItem())
    expect(result.vendor).toBe('NVIDIA')
    expect(result.productType).toBe('Desktop Graphics Cards')
  })

  it('maps Active=true to ACTIVE status', () => {
    expect(transformProduct(makeItem()).status).toBe('ACTIVE')
  })

  it('maps Active=false to ARCHIVED status', () => {
    const result = transformProduct(makeItem({ Active: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('defaults to DRAFT when Active is undefined', () => {
    const result = transformProduct(makeItem({ Active: undefined }))
    expect(result.status).toBe('DRAFT')
  })

  it('extracts images from ImageUrl + AdditionalImageUrls', () => {
    const result = transformProduct(makeItem())
    expect(result.images).toHaveLength(3)
    expect(result.images![0]).toMatchObject({
      url: 'https://c1.neweggimages.com/productimage/rtx4090-main.jpg',
      position: 0,
    })
    expect(result.images![1]).toMatchObject({
      url: 'https://c1.neweggimages.com/productimage/rtx4090-side.jpg',
      position: 1,
    })
  })

  it('returns undefined images when none are present', () => {
    const result = transformProduct(
      makeItem({ ImageUrl: undefined, AdditionalImageUrls: undefined }),
    )
    expect(result.images).toBeUndefined()
  })

  it('produces a payload that satisfies ProductSchema and preserves raw in metadata', () => {
    const raw = makeItem()
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
    expect(result.metadata['NeweggItemNumber']).toBe('9SIAABC12345')
    expect(result.metadata['SellingPrice']).toBe(1599.99)
  })

  it('round-trips title into a Newegg item body via untransformProduct', () => {
    const canonical = transformProduct(makeItem())
    const body = untransformProduct(canonical)
    expect(body['Title']).toBe('NVIDIA GeForce RTX 4090 Founders Edition 24GB GDDR6X')
    expect(body['MfrName']).toBe('NVIDIA')
    expect(body['ImageUrl']).toBe('https://c1.neweggimages.com/productimage/rtx4090-main.jpg')
    expect(body['AdditionalImageUrls']).toHaveLength(2)
  })

  it('preserves UPCCode and SellingPrice from metadata in untransformProduct', () => {
    const canonical = transformProduct(makeItem())
    const body = untransformProduct(canonical)
    expect(body['UPCCode']).toBe('012345678901')
    expect(body['SellingPrice']).toBe(1599.99)
  })

  it('preserves ManufacturerPartNumber from metadata', () => {
    const canonical = transformProduct(makeItem())
    const body = untransformProduct(canonical)
    expect(body['ManufacturerPartNumber']).toBe('RTX4090-FE')
  })

  it('preserves Condition from metadata', () => {
    const canonical = transformProduct(makeItem())
    const body = untransformProduct(canonical)
    expect(body['Condition']).toBe('New')
  })
})
