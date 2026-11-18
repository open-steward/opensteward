import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawNhnStockInfo,
} from '../../../../../../../src/verticals/ecommerce/adapters/nhn-commerce/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeRaw(overrides: Partial<RawNhnStockInfo> = {}): RawNhnStockInfo {
  return {
    optionNo: 10001,
    productNo: 555,
    stockCnt: 25,
    ...overrides,
  }
}

describe('transformInventoryLevel (NHN Commerce)', () => {
  it('synthesises id as variantId:locationId', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.id).toBe('10001:555')
  })

  it('maps optionNo to variantId', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.variantId).toBe('10001')
  })

  it('uses productNo as locationId by default', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.locationId).toBe('555')
  })

  it('accepts a custom locationId', () => {
    const result = transformInventoryLevel(makeRaw(), 'WH-SEOUL')
    expect(result.locationId).toBe('WH-SEOUL')
    expect(result.id).toBe('10001:WH-SEOUL')
  })

  it('maps stockCnt to available', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.available).toBe(25)
  })

  it('defaults to 0 when stockCnt is undefined', () => {
    const result = transformInventoryLevel(makeRaw({ stockCnt: undefined }))
    expect(result.available).toBe(0)
  })

  it('falls back to productNo as variantId when optionNo is absent', () => {
    const result = transformInventoryLevel(makeRaw({ optionNo: undefined }))
    expect(result.variantId).toBe('555')
  })

  it('defaults locationId to "default" when productNo is also absent', () => {
    const result = transformInventoryLevel(makeRaw({ optionNo: undefined, productNo: undefined }))
    expect(result.locationId).toBe('default')
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
