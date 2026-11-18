import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawRechargeInventoryStub,
} from '../../../../../../../src/verticals/ecommerce/adapters/recharge/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStub(overrides: Partial<RawRechargeInventoryStub> = {}): RawRechargeInventoryStub {
  return {
    id: 101,
    ...overrides,
  }
}

describe('transformInventoryLevel', () => {
  it('constructs a synthetic id from the stub id', () => {
    const result = transformInventoryLevel(makeStub())
    expect(result.id).toBe('101:default')
  })

  it('uses the stub id as variantId', () => {
    const result = transformInventoryLevel(makeStub())
    expect(result.variantId).toBe('101')
  })

  it('always uses "default" as locationId', () => {
    const result = transformInventoryLevel(makeStub())
    expect(result.locationId).toBe('default')
  })

  it('always reports 0 available', () => {
    const result = transformInventoryLevel(makeStub())
    expect(result.available).toBe(0)
  })

  it('marks metadata as synthetic', () => {
    const result = transformInventoryLevel(makeStub())
    expect(result.metadata?.synthetic).toBe(true)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeStub())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
