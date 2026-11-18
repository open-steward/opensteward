import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawEpicorKineticPart,
} from '../../../../../../../src/verticals/inventory/adapters/epicor-kinetic/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('epicor-kinetic transformProduct', () => {
  const raw: RawEpicorKineticPart = {
    PartNum: 'WK-2026',
    PartDescription: 'Wireless Keyboard',
    ClassID: 'PERIPH',
    IUM: 'each',
    NetWeight: 1,
    WeightUOM: 'LB',
    UnitPrice: 4999,
    CostMethod: 'AVG',
    InActive: false,
    TrackSerialNum: false,
    TrackLots: false,
    ParentPartNum: undefined,
    SysRowID: 'guid-001',
    CreatedOn: '2024-03-01T00:00:00Z',
    ChangedOn: '2024-03-01T00:00:00Z',
  }

  it('maps id and sku from PartNum', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('WK-2026')
    expect(result.sku).toBe('WK-2026')
  })

  it('maps externalId from SysRowID', () => {
    const result = transformProduct(raw)
    expect(result.externalId).toBe('guid-001')
  })

  it('maps name from PartDescription', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('maps category from ClassID', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('PERIPH')
  })

  it('maps unitOfMeasure from IUM', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('converts weight in LB to grams', () => {
    const result = transformProduct(raw)
    // 1 LB = 453.592 g
    expect(result.weightGrams).toBeCloseTo(453.592, 1)
  })

  it('converts weight in KG to grams', () => {
    const result = transformProduct({ ...raw, NetWeight: 2, WeightUOM: 'KG' })
    expect(result.weightGrams).toBe(2000)
  })

  it('maps retailPrice from UnitPrice in USD', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('sets isActive true when InActive is false', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when InActive is true', () => {
    const result = transformProduct({ ...raw, InActive: true })
    expect(result.isActive).toBe(false)
  })

  it('maps parentProductId from ParentPartNum', () => {
    const result = transformProduct({ ...raw, ParentPartNum: 'PARENT-001' })
    expect(result.parentProductId).toBe('PARENT-001')
  })

  it('sets platform to epicor-kinetic', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('epicor-kinetic')
  })

  it('maps createdAt from CreatedOn', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
