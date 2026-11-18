import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawShopifyProduct,
  type RawShopifyVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/loja-integrada/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeRawProduct(overrides: Partial<RawShopifyProduct> = {}): RawShopifyProduct {
  return {
    id: 1001,
    title: 'Camiseta Básica',
    body_html: '<p>Camiseta de algodão 100%.</p>',
    handle: 'camiseta-basica',
    status: 'active',
    vendor: 'Marca Brasil',
    product_type: 'Roupas',
    tags: 'verão, algodão',
    options: [{ id: 10, name: 'Cor', position: 0, values: ['Branco', 'Preto'] }],
    variants: [
      {
        id: 2001,
        product_id: 1001,
        title: 'Branco',
        price: '49.90',
        compare_at_price: '59.90',
        sku: 'CAM-BRA-001',
        barcode: '7891234560001',
        position: 0,
        inventory_item_id: 3001,
        weight: 200,
        weight_unit: 'g',
        taxable: true,
        requires_shipping: true,
        option1: 'Branco',
      },
    ],
    images: [
      {
        id: 4001,
        product_id: 1001,
        position: 0,
        src: 'https://cdn.exemplo.com.br/camiseta-branca.jpg',
        alt: 'Camiseta Branca',
        width: 800,
        height: 800,
      },
    ],
    created_at: '2024-01-15T08:00:00Z',
    updated_at: '2024-02-20T14:30:00Z',
    published_at: '2024-01-15T10:00:00Z',
    ...overrides,
  }
}

describe('transformProduct (loja-integrada / Shopify)', () => {
  it('maps id, title, description, handle, and status', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.id).toBe('1001')
    expect(result.title).toBe('Camiseta Básica')
    expect(result.description).toBe('<p>Camiseta de algodão 100%.</p>')
    expect(result.handle).toBe('camiseta-basica')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps vendor, productType, and tags', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.vendor).toBe('Marca Brasil')
    expect(result.productType).toBe('Roupas')
    expect(result.tags).toEqual(['verão', 'algodão'])
  })

  it('maps options', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.options).toHaveLength(1)
    expect(result.options![0]!.name).toBe('Cor')
    expect(result.options![0]!.values).toEqual(['Branco', 'Preto'])
  })

  it('maps variants with prices in minor units', () => {
    const result = transformProduct(makeRawProduct(), 'BRL')
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('2001')
    expect(v.sku).toBe('CAM-BRA-001')
    expect(v.price).toEqual({ amount: 4990, currency: 'BRL' })
    expect(v.compareAtPrice).toEqual({ amount: 5990, currency: 'BRL' })
  })

  it('maps variant optionValues from option1/option2/option3', () => {
    const result = transformProduct(makeRawProduct(), 'BRL')
    const v = result.variants![0]!
    expect(v.optionValues).toEqual({ Cor: 'Branco' })
  })

  it('maps images', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.images).toHaveLength(1)
    const img = result.images![0]!
    expect(img.id).toBe('4001')
    expect(img.url).toBe('https://cdn.exemplo.com.br/camiseta-branca.jpg')
    expect(img.alt).toBe('Camiseta Branca')
  })

  it('maps timestamps and publishedAt', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.createdAt).toBe('2024-01-15T08:00:00Z')
    expect(result.updatedAt).toBe('2024-02-20T14:30:00Z')
    expect(result.publishedAt).toBe('2024-01-15T10:00:00Z')
  })

  it('returns undefined options/variants/images when arrays are empty', () => {
    const result = transformProduct(makeRawProduct({ options: [], variants: [], images: [] }))
    expect(result.options).toBeUndefined()
    expect(result.variants).toBeUndefined()
    expect(result.images).toBeUndefined()
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeRawProduct(), 'BRL')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformVariant (loja-integrada / Shopify)', () => {
  it('maps all fields correctly', () => {
    const raw: RawShopifyVariant = {
      id: 2002,
      product_id: 1001,
      title: 'Preto',
      price: '49.90',
      sku: 'CAM-PRT-001',
      barcode: '7891234560002',
      position: 1,
      inventory_item_id: 3002,
      weight: 200,
      weight_unit: 'g',
      taxable: false,
      requires_shipping: true,
    }
    const result = transformVariant(raw, 'BRL')
    expect(result.id).toBe('2002')
    expect(result.productId).toBe('1001')
    expect(result.price).toEqual({ amount: 4990, currency: 'BRL' })
    expect(result.inventoryItemId).toBe('3002')
    expect(result.taxable).toBe(false)
    expect(result.requiresShipping).toBe(true)
  })

  it('produces a payload that satisfies ProductVariantSchema', () => {
    const raw: RawShopifyVariant = {
      id: 2003,
      price: '29.90',
      title: 'Default',
    }
    const result = transformVariant(raw, 'BRL')
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})

describe('untransformProduct (loja-integrada / Shopify)', () => {
  it('maps canonical product back to Shopify body keys', () => {
    const result = untransformProduct({
      title: 'Camiseta Básica',
      description: '<p>Algodão 100%.</p>',
      handle: 'camiseta-basica',
      vendor: 'Marca Brasil',
      status: 'ACTIVE',
      tags: ['verão', 'algodão'],
    })
    expect(result.title).toBe('Camiseta Básica')
    expect(result.body_html).toBe('<p>Algodão 100%.</p>')
    expect(result.handle).toBe('camiseta-basica')
    expect(result.vendor).toBe('Marca Brasil')
    // status is lowercased for Shopify
    expect(result.status).toBe('active')
    expect(result.tags).toBe('verão, algodão')
  })
})

describe('untransformVariant (loja-integrada / Shopify)', () => {
  it('maps canonical variant back to Shopify body keys', () => {
    const result = untransformVariant({
      id: '2001',
      sku: 'CAM-BRA-001',
      price: { amount: 4990, currency: 'BRL' },
      taxable: true,
    })
    expect(result.id).toBe('2001')
    expect(result.sku).toBe('CAM-BRA-001')
    expect(result.price).toBe(4990)
    expect(result.taxable).toBe(true)
  })
})
