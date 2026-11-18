// NuORDER Product Collection fields verified against
// https://assets.nuorder.com/api-docs/index.html
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawNuorderProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/nuorder/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeRaw(overrides: Partial<RawNuorderProduct> = {}): RawNuorderProduct {
  return {
    id: 4001,
    style_number: 'ST-100',
    season: 'FW26',
    color: 'Black',
    name: 'Classic Tee',
    brand_id: 'brand_1',
    description: 'A classic crew-neck tee.',
    active: true,
    archived: false,
    cancelled: false,
    available_from: '2026-01-01T00:00:00Z',
    created_on: '2025-12-01T00:00:00Z',
    modified_on: '2026-01-15T00:00:00Z',
    images: ['https://cdn.nuorder.com/img1.jpg', { url: 'https://cdn.nuorder.com/img2.jpg', id: 'img2' }],
    ...overrides,
  }
}

describe('transformProduct (NuORDER)', () => {
  it('passes the canonical schema', () => {
    expect(() => ProductSchema.parse(transformProduct(makeRaw()))).not.toThrow()
  })

  it('maps id to string canonical id', () => {
    expect(transformProduct(makeRaw()).id).toBe('4001')
  })

  it('falls back to external_id when id is absent', () => {
    const result = transformProduct(makeRaw({ id: undefined, external_id: 'ext-99' }))
    expect(result.id).toBe('ext-99')
  })

  it('throws rather than inventing an id when neither id nor external_id is present', () => {
    expect(() => transformProduct(makeRaw({ id: undefined, external_id: undefined }))).toThrow(/id/i)
  })

  it('maps name to title and description through', () => {
    const result = transformProduct(makeRaw())
    expect(result.title).toBe('Classic Tee')
    expect(result.description).toBe('A classic crew-neck tee.')
  })

  it('builds tags from color and season', () => {
    expect(transformProduct(makeRaw()).tags).toEqual(['Black', 'FW26'])
  })

  it('maps active/archived/cancelled to canonical status', () => {
    expect(transformProduct(makeRaw({ active: true, archived: false, cancelled: false })).status).toBe('ACTIVE')
    expect(transformProduct(makeRaw({ active: false })).status).toBe('DRAFT')
    expect(transformProduct(makeRaw({ archived: true })).status).toBe('ARCHIVED')
    expect(transformProduct(makeRaw({ cancelled: true })).status).toBe('ARCHIVED')
  })

  it('accepts both string and {url} image entries, dropping unrecognised ones', () => {
    const result = transformProduct(makeRaw({ images: ['https://a.example/1.jpg', { foo: 'bar' }, { url: 'https://a.example/2.jpg' }] }))
    expect(result.images).toEqual([{ url: 'https://a.example/1.jpg' }, { id: undefined, url: 'https://a.example/2.jpg' }])
  })

  it('converts created_on/modified_on to ISO 8601', () => {
    const result = transformProduct(makeRaw())
    expect(result.createdAt).toBe('2025-12-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2026-01-15T00:00:00.000Z')
  })

  it('preserves the raw record as metadata', () => {
    const raw = makeRaw()
    expect(transformProduct(raw).metadata).toEqual(raw)
  })
})

describe('untransformProduct (NuORDER)', () => {
  it('emits only name/description — no vendor/productType/handle/options/tags, which have no confirmed field', () => {
    const body = untransformProduct({
      title: 'New Title',
      description: 'New desc',
      vendor: 'Acme',
      handle: 'new-title',
      tags: ['x'],
    })
    expect(body).toEqual({ name: 'New Title', description: 'New desc' })
  })
})
