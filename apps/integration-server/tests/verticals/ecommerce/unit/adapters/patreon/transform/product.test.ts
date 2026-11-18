import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformTier,
  untransformProduct,
  type RawPatreonCampaign,
  type RawPatreonTier,
} from '../../../../../../../src/verticals/ecommerce/adapters/patreon/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeCampaign(overrides: Partial<RawPatreonCampaign> = {}): RawPatreonCampaign {
  return {
    id: '12345',
    created_at: '2023-01-15T10:00:00.000+00:00',
    creation_name: 'My Creative Project',
    image_url: 'https://c10.patreonusercontent.com/image.jpg',
    image_small_url: 'https://c10.patreonusercontent.com/image_small.jpg',
    is_monthly: true,
    is_nsfw: false,
    one_liner: 'Supporting independent creators',
    patron_count: 150,
    pledge_url: '/join/mycreativeproject',
    published_at: '2023-01-20T12:00:00.000+00:00',
    summary: '<p>A project about creative things.</p>',
    url: 'https://www.patreon.com/mycreativeproject',
    vanity: 'mycreativeproject',
    _type: 'campaign',
    _relationships: {
      tiers: { data: [{ type: 'tier', id: '100' }, { type: 'tier', id: '200' }] },
    },
    _included: [
      {
        id: '100',
        _type: 'tier',
        title: 'Basic Supporter',
        amount_cents: 500,
        description: 'Basic tier with updates',
        patron_count: 100,
        published: true,
        published_at: '2023-01-20T12:00:00.000+00:00',
      },
      {
        id: '200',
        _type: 'tier',
        title: 'Premium Patron',
        amount_cents: 2000,
        description: 'Premium tier with extras',
        patron_count: 50,
        published: true,
        published_at: '2023-01-20T12:00:00.000+00:00',
      },
    ],
    ...overrides,
  }
}

function makeTier(overrides: Partial<RawPatreonTier> = {}): RawPatreonTier {
  return {
    id: '100',
    title: 'Basic Supporter',
    amount_cents: 500,
    description: 'Basic tier with updates',
    patron_count: 100,
    published: true,
    _type: 'tier',
    ...overrides,
  }
}

describe('transformProduct (Patreon Campaign)', () => {
  it('maps core campaign fields to product', () => {
    const result = transformProduct(makeCampaign())
    expect(result.id).toBe('12345')
    expect(result.title).toBe('My Creative Project')
    expect(result.description).toBe('<p>A project about creative things.</p>')
    expect(result.handle).toBe('mycreativeproject')
    expect(result.status).toBe('ACTIVE')
    expect(result.productType).toBe('campaign')
  })

  it('maps tiers from included as variants', () => {
    const result = transformProduct(makeCampaign())
    expect(result.variants).toHaveLength(2)
    const v0 = result.variants![0]!
    expect(v0.id).toBe('100')
    expect(v0.productId).toBe('12345')
    expect(v0.title).toBe('Basic Supporter')
    expect(v0.price).toEqual({ amount: 5, currency: 'USD' })
    const v1 = result.variants![1]!
    expect(v1.id).toBe('200')
    expect(v1.price).toEqual({ amount: 20, currency: 'USD' })
  })

  it('maps images from campaign', () => {
    const result = transformProduct(makeCampaign())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]!.url).toBe('https://c10.patreonusercontent.com/image.jpg')
    expect(result.images![1]!.url).toBe('https://c10.patreonusercontent.com/image_small.jpg')
  })

  it('uses DRAFT status when not published', () => {
    const result = transformProduct(makeCampaign({ published_at: null }))
    expect(result.status).toBe('DRAFT')
  })

  it('handles campaign with no tiers', () => {
    const result = transformProduct(makeCampaign({ _included: [] }))
    expect(result.variants).toBeUndefined()
  })

  it('uses vanity as fallback title', () => {
    const result = transformProduct(makeCampaign({ creation_name: undefined }))
    expect(result.title).toBe('mycreativeproject')
  })

  it('adds nsfw tag when applicable', () => {
    const result = transformProduct(makeCampaign({ is_nsfw: true }))
    expect(result.tags).toEqual(['nsfw'])
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeCampaign()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeCampaign())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformTier (Patreon Tier → ProductVariant)', () => {
  it('maps tier to canonical variant', () => {
    const v = transformTier(makeTier(), '12345')
    expect(v.id).toBe('100')
    expect(v.productId).toBe('12345')
    expect(v.title).toBe('Basic Supporter')
    expect(v.price).toEqual({ amount: 5, currency: 'USD' })
    expect(() => ProductVariantSchema.parse(v)).not.toThrow()
  })

  it('handles zero amount tiers (free tier)', () => {
    const v = transformTier(makeTier({ amount_cents: 0 }), '12345')
    expect(v.price).toEqual({ amount: 0, currency: 'USD' })
  })
})

describe('untransformProduct (Patreon)', () => {
  it('round-trips writable fields', () => {
    const body = untransformProduct({
      title: 'My Project',
      description: 'A description',
    }) as { data: { type: string; attributes: Record<string, unknown> } }
    expect(body.data.type).toBe('campaign')
    expect(body.data.attributes['creation_name']).toBe('My Project')
    expect(body.data.attributes['summary']).toBe('A description')
  })
})
