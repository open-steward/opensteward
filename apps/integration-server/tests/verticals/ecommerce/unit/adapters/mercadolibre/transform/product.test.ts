import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawMeliItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/mercadolibre/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeItem(overrides: Partial<RawMeliItem> = {}): RawMeliItem {
  return {
    id: 'MLA123456789',
    site_id: 'MLA',
    title: 'Zapatillas Nike Air Max 90',
    seller_id: 999888777,
    category_id: 'MLA1234',
    price: 45000,
    currency_id: 'ARS',
    initial_quantity: 100,
    available_quantity: 42,
    sold_quantity: 58,
    buying_mode: 'buy_it_now',
    listing_type_id: 'gold_special',
    condition: 'new',
    permalink: 'https-articulo-mercadolibre-com-ar-mla-123456789',
    pictures: [
      {
        id: 'PIC-001',
        url: 'http://http2.mlstatic.com/D_NQ_NP_001.jpg',
        secure_url: 'https://http2.mlstatic.com/D_NQ_NP_001.jpg',
      },
      {
        id: 'PIC-002',
        url: 'http://http2.mlstatic.com/D_NQ_NP_002.jpg',
        secure_url: 'https://http2.mlstatic.com/D_NQ_NP_002.jpg',
      },
    ],
    status: 'active',
    tags: ['good_quality_thumbnail', 'immediate_payment'],
    attributes: [
      { id: 'BRAND', name: 'Marca', value_id: '9344', value_name: 'Nike' },
      { id: 'MODEL', name: 'Modelo', value_id: null, value_name: 'Air Max 90' },
      { id: 'ITEM_CONDITION', name: 'Condición del ítem', value_id: '2230284', value_name: 'Nuevo' },
    ],
    date_created: '2024-01-15T10:00:00.000Z',
    last_updated: '2024-05-01T14:30:00.000Z',
    ...overrides,
  }
}

describe('transformProduct (Mercado Libre)', () => {
  it('uses the ML item ID as the canonical id', () => {
    const result = transformProduct(makeItem())
    expect(result.id).toBe('MLA123456789')
    expect(result.title).toBe('Zapatillas Nike Air Max 90')
  })

  it('surfaces brand attribute as vendor', () => {
    const result = transformProduct(makeItem())
    expect(result.vendor).toBe('Nike')
  })

  it('maps active status to ACTIVE', () => {
    expect(transformProduct(makeItem()).status).toBe('ACTIVE')
  })

  it('maps paused status to DRAFT', () => {
    const result = transformProduct(makeItem({ status: 'paused' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps closed status to ARCHIVED', () => {
    const result = transformProduct(makeItem({ status: 'closed' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps under_review status to DRAFT', () => {
    const result = transformProduct(makeItem({ status: 'under_review' }))
    expect(result.status).toBe('DRAFT')
  })

  it('extracts image URLs into canonical images with positions', () => {
    const result = transformProduct(makeItem())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]).toMatchObject({
      id: 'PIC-001',
      url: 'https://http2.mlstatic.com/D_NQ_NP_001.jpg',
      position: 0,
    })
    expect(result.images![1]).toMatchObject({
      id: 'PIC-002',
      url: 'https://http2.mlstatic.com/D_NQ_NP_002.jpg',
      position: 1,
    })
  })

  it('prefers secure_url over plain url', () => {
    const result = transformProduct(makeItem())
    expect(result.images![0]!.url).toMatch(/^https:/)
  })

  it('uses permalink as handle', () => {
    const result = transformProduct(makeItem())
    expect(result.handle).toBe('https-articulo-mercadolibre-com-ar-mla-123456789')
  })

  it('populates timestamps', () => {
    const result = transformProduct(makeItem())
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-05-01T14:30:00.000Z')
  })

  it('includes tags from ML', () => {
    const result = transformProduct(makeItem())
    expect(result.tags).toEqual(['good_quality_thumbnail', 'immediate_payment'])
  })

  it('produces a payload that satisfies ProductSchema and preserves raw in metadata', () => {
    const raw = makeItem()
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
    expect(result.metadata['id']).toBe('MLA123456789')
  })

  it('handles item with no pictures gracefully', () => {
    const result = transformProduct(makeItem({ pictures: undefined }))
    expect(result.images).toBeUndefined()
  })

  it('handles item with no attributes gracefully', () => {
    const result = transformProduct(makeItem({ attributes: undefined }))
    expect(result.vendor).toBeUndefined()
  })

  it('round-trips title into an ML item body via untransformProduct', () => {
    const canonical = transformProduct(makeItem())
    const body = untransformProduct(canonical)
    expect(body['title']).toBe('Zapatillas Nike Air Max 90')
  })

  it('maps images to pictures with source URLs in untransformProduct', () => {
    const canonical = transformProduct(makeItem())
    const body = untransformProduct(canonical)
    const pics = body['pictures'] as Array<{ source: string }>
    expect(pics).toHaveLength(2)
    expect(pics[0]!.source).toMatch(/^https:/)
  })

  it('maps ACTIVE status back to "active" in untransformProduct', () => {
    const body = untransformProduct({ status: 'ACTIVE' })
    expect(body['status']).toBe('active')
  })

  it('maps ARCHIVED status back to "closed" in untransformProduct', () => {
    const body = untransformProduct({ status: 'ARCHIVED' })
    expect(body['status']).toBe('closed')
  })
})
