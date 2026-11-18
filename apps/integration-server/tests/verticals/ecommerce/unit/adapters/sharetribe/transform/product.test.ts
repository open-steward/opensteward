import { describe, it, expect } from 'vitest'
import {
  transformListing,
  untransformListing,
  type RawSharetribeListing,
  type SharetribeUUID,
} from '../../../../../../../src/verticals/ecommerce/adapters/sharetribe/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function uuid(id: string): SharetribeUUID {
  return { uuid: id }
}

function makeListing(overrides: Partial<RawSharetribeListing> = {}): RawSharetribeListing {
  return {
    id: uuid('listing-uuid-001'),
    type: 'listing',
    attributes: {
      title: 'Vintage Bicycle',
      description: '<p>A lovely vintage bicycle in good condition.</p>',
      state: 'published',
      price: { amount: 15000, currency: 'USD' },
      publicData: { condition: 'good', category: 'bicycles' },
      privateData: { internalNote: 'verified' },
      metadata: { featured: true },
      createdAt: '2026-01-15T09:30:00.000Z',
      geolocation: { lat: 37.7749, lng: -122.4194 },
      deleted: false,
      availabilityPlan: { type: 'availability-plan/day' },
    },
    relationships: {
      images: { data: [uuid('img-001'), uuid('img-002')] },
      author: { data: uuid('user-001') },
      marketplace: { data: uuid('mkt-001') },
    },
    ...overrides,
  }
}

// ── transformListing ──────────────────────────────────────────────────────────

describe('transformListing (Sharetribe)', () => {
  it('maps id from uuid wrapper', () => {
    const result = transformListing(makeListing())
    expect(result.id).toBe('listing-uuid-001')
  })

  it('maps title and description from attributes', () => {
    const result = transformListing(makeListing())
    expect(result.title).toBe('Vintage Bicycle')
    expect(result.description).toBe('<p>A lovely vintage bicycle in good condition.</p>')
  })

  it('maps published state to ACTIVE status', () => {
    const result = transformListing(makeListing())
    expect(result.status).toBe('ACTIVE')
  })

  it('maps draft state to DRAFT status', () => {
    const result = transformListing(makeListing({ attributes: { ...makeListing().attributes, state: 'draft' } }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps pendingApproval state to DRAFT status', () => {
    const raw = makeListing()
    raw.attributes.state = 'pendingApproval'
    const result = transformListing(raw)
    expect(result.status).toBe('DRAFT')
  })

  it('maps closed state to ARCHIVED status', () => {
    const raw = makeListing()
    raw.attributes.state = 'closed'
    const result = transformListing(raw)
    expect(result.status).toBe('ARCHIVED')
  })

  it('builds a single variant with price in minor units', () => {
    const result = transformListing(makeListing())
    expect(result.variants).toHaveLength(1)
    const variant = result.variants![0]!
    // Sharetribe stores amounts already in minor units (cents)
    expect(variant.price).toEqual({ amount: 15000, currency: 'USD' })
    expect(variant.id).toBe('listing-uuid-001')
    expect(variant.productId).toBe('listing-uuid-001')
  })

  it('maps image ids into metadata imageIds', () => {
    const result = transformListing(makeListing())
    expect(result.metadata['imageIds']).toEqual(['img-001', 'img-002'])
  })

  it('maps author id into metadata authorId', () => {
    const result = transformListing(makeListing())
    expect(result.metadata['authorId']).toBe('user-001')
  })

  it('maps createdAt', () => {
    const result = transformListing(makeListing())
    expect(result.createdAt).toBe('2026-01-15T09:30:00.000Z')
  })

  it('handles missing price by defaulting to 0 USD', () => {
    const raw = makeListing()
    raw.attributes.price = null
    const result = transformListing(raw)
    expect(result.variants![0]!.price).toEqual({ amount: 0, currency: 'USD' })
  })

  it('handles missing relationships gracefully', () => {
    const raw = makeListing()
    delete raw.relationships
    const result = transformListing(raw)
    expect(result.metadata['imageIds']).toEqual([])
    expect(result.metadata['authorId']).toBeUndefined()
  })

  it('produces a payload satisfying ProductSchema', () => {
    const result = transformListing(makeListing())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

// ── untransformListing ────────────────────────────────────────────────────────

describe('untransformListing (Sharetribe)', () => {
  it('maps title and description', () => {
    const body = untransformListing({ title: 'Test Bike', description: 'Nice bike' })
    expect(body['title']).toBe('Test Bike')
    expect(body['description']).toBe('Nice bike')
  })

  it('maps ACTIVE status to published', () => {
    const body = untransformListing({ status: 'ACTIVE' })
    expect(body['state']).toBe('published')
  })

  it('maps ARCHIVED status to closed', () => {
    const body = untransformListing({ status: 'ARCHIVED' })
    expect(body['state']).toBe('closed')
  })

  it('maps price from first variant', () => {
    const body = untransformListing({
      variants: [{ id: 'v1', price: { amount: 9900, currency: 'EUR' }, metadata: {} }],
    })
    expect(body['price']).toEqual({ amount: 9900, currency: 'EUR' })
  })

  it('includes publicData from metadata', () => {
    const body = untransformListing({
      metadata: { publicData: { category: 'bikes' } },
    })
    expect(body['publicData']).toEqual({ category: 'bikes' })
  })
})
