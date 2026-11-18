import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawRechargeCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/recharge/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCollection(overrides: Partial<RawRechargeCollection> = {}): RawRechargeCollection {
  return {
    id: 200,
    title: 'Subscription Coffees',
    handle: 'subscription-coffees',
    sort_order: 'alpha',
    productIds: ['1', '2', '3'],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-02-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCollection', () => {
  it('maps id, title, handle', () => {
    const result = transformCollection(makeCollection())
    expect(result.id).toBe('200')
    expect(result.title).toBe('Subscription Coffees')
    expect(result.handle).toBe('subscription-coffees')
  })

  it('type is always MANUAL', () => {
    expect(transformCollection(makeCollection()).type).toBe('MANUAL')
  })

  it('maps productIds', () => {
    const result = transformCollection(makeCollection())
    expect(result.productIds).toEqual(['1', '2', '3'])
  })

  it('defaults productIds to empty array when absent', () => {
    const result = transformCollection(makeCollection({ productIds: undefined }))
    expect(result.productIds).toEqual([])
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCollection()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    const result = transformCollection(makeCollection())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips title and handle via untransformCollection', () => {
    const canonical = transformCollection(makeCollection())
    const raw = untransformCollection(canonical)
    expect(raw.title).toBe('Subscription Coffees')
    expect(raw.handle).toBe('subscription-coffees')
  })
})
