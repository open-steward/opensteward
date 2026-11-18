/**
 * Fixture shape verified against `gofynd/fdk-client-javascript` @ commit
 * `7598488bf04e7a75bc44088441745538d524abec`,
 * `sdk/platform/Catalog/CatalogPlatformModel.js` — `Category()`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  type RawFyndCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/fynd/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawFyndCategory> = {}): RawFyndCategory {
  return {
    uid: 42,
    name: 'Accessories',
    slug: 'accessories',
    media: { logo: 'https://cdn.example.com/accessories.png' },
    modified_on: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('transformCollection', () => {
  it('maps core fields and stringifies uid as id', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('42')
    expect(result.title).toBe('Accessories')
    expect(result.handle).toBe('accessories')
    expect(result.image?.url).toBe('https://cdn.example.com/accessories.png')
  })

  it('throws when uid is missing', () => {
    expect(() => transformCollection({ ...makeCategory(), uid: undefined as unknown as number })).toThrow(
      /uid/,
    )
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCategory()
    expect(transformCollection(raw).metadata).toBe(raw)
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    const result = transformCollection(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})

describe('transformCollection (fynd): no invented title', () => {
  it('throws rather than giving a category with no name an empty title', () => {
    expect(() => transformCollection({ ...makeCategory(), name: undefined as unknown as string })).toThrow(/no name/)
  })
})
