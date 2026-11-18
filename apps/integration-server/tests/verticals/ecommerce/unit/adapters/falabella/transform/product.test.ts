/**
 * Doc: https://developers.falabella.com/docs/products/getproducts (verbatim
 * XML response example quoted in the source file header).
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawFalabellaProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/falabella/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeRaw(overrides: Partial<RawFalabellaProduct> = {}): RawFalabellaProduct {
  return {
    SellerSku: 'test-seller-sku-001',
    Name: 'Zapatillas Marca Test Modelo X Negro Hombre',
    Description: 'Este es un producto de prueba con descripción ficticia para validar integraciones.',
    Brand: 'TEST BRAND',
    PrimaryCategory: 'Zapatillas deportivas',
    MainImage: 'https://sellercenter-static.falabella.com/test/test-main-image-001.jpeg',
    Images: {
      Image: [
        'https://sellercenter-static.falabella.com/test/test-image-001.jpeg',
        'https://sellercenter-static.falabella.com/test/test-image-002.jpeg',
      ],
    },
    ...overrides,
  }
}

describe('transformProduct (Falabella)', () => {
  it('maps SellerSku to id and Name to title', () => {
    const result = transformProduct(makeRaw())
    expect(result.id).toBe('test-seller-sku-001')
    expect(result.title).toBe('Zapatillas Marca Test Modelo X Negro Hombre')
    expect(result.vendor).toBe('TEST BRAND')
    expect(result.productType).toBe('Zapatillas deportivas')
  })

  it('combines MainImage with the Images.Image gallery, de-duplicated', () => {
    const result = transformProduct(makeRaw({ MainImage: undefined }))
    expect(result.images).toHaveLength(2)
    const withMain = transformProduct(makeRaw())
    expect(withMain.images).toHaveLength(3)
    expect(withMain.images![0]!.url).toBe('https://sellercenter-static.falabella.com/test/test-main-image-001.jpeg')
  })

  it('handles a single Images.Image string (XML→JSON collapses a 1-item list)', () => {
    const raw = makeRaw({ MainImage: undefined, Images: { Image: 'https://x/one.jpeg' } })
    const result = transformProduct(raw)
    expect(result.images).toEqual([{ url: 'https://x/one.jpeg', position: 0 }])
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeRaw()
    expect(transformProduct(raw).metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(makeRaw()))).not.toThrow()
  })
})

describe('untransformProduct (Falabella)', () => {
  it('builds a ProductCreate/ProductUpdate XML body with the required fields', () => {
    const xml = untransformProduct({
      id: 'sku-1',
      title: 'New product',
      description: 'A description',
      primaryCategoryId: '12345',
      price: '19990.00',
      stock: 10,
      operatorCode: 'facl',
    })
    expect(xml).toContain('<SellerSku>sku-1</SellerSku>')
    expect(xml).toContain('<Name>New product</Name>')
    expect(xml).toContain('<PrimaryCategory>12345</PrimaryCategory>')
    expect(xml).toContain('<OperatorCode>facl</OperatorCode>')
    expect(xml).toContain('<Price>19990.00</Price>')
    expect(xml).toContain('<Stock>10</Stock>')
    expect(xml).toContain('<Description>A description</Description>')
  })

  it('escapes XML-significant characters', () => {
    const xml = untransformProduct({
      id: 'sku-1',
      title: 'Cool & Trendy <Shoes>',
      primaryCategoryId: '1',
      price: '1.00',
      stock: 1,
      operatorCode: 'facl',
    })
    expect(xml).toContain('Cool &amp; Trendy &lt;Shoes&gt;')
  })
})
