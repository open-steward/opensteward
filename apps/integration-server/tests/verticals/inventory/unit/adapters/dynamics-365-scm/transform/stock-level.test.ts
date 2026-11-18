import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawD365IvStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/dynamics-365-scm/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('dynamics-365-scm transformStockLevel', () => {
  const raw: RawD365IvStockLevel = {
    productId: 'ITEM-001',
    dimensions: {
      siteId: 'SITE-1',
      locationId: 'WH-001',
    },
    quantities: {
      fno: {
        physicalinvent: 200,
        availordered: 180,
        reservphysical: 20,
        onorder: 50,
      },
      iv: {
        totalavailable: 175,
        softreserved: 5,
      },
    },
  }

  it('maps productId from productId', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('ITEM-001')
  })

  it('maps locationId from dimensions.locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('WH-001')
  })

  it('computes composite id as productId:siteId:locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('ITEM-001:SITE-1:WH-001')
  })

  it('maps quantityOnHand from fno.physicalinvent', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(200)
  })

  it('prefers iv.totalavailable over fno.availordered for quantityAvailable', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(175)
  })

  it('falls back to fno.availordered for quantityAvailable when iv absent', () => {
    const result = transformStockLevel({ ...raw, quantities: { fno: raw.quantities.fno } })
    expect(result.quantityAvailable).toBe(180)
  })

  it('maps quantityCommitted from fno.reservphysical', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(20)
  })

  it('maps quantityIncoming from fno.onorder', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(50)
  })

  it('falls back quantityOnHand to 0 when fno.physicalinvent absent', () => {
    const result = transformStockLevel({ ...raw, quantities: {} })
    expect(result.quantityOnHand).toBe(0)
  })

  it('uses siteId as locationId when locationId is absent', () => {
    const result = transformStockLevel({
      ...raw,
      dimensions: { siteId: 'SITE-1' },
    })
    expect(result.locationId).toBe('SITE-1')
  })

  it('sets platform to dynamics-365-scm', () => {
    const result = transformStockLevel(raw)
    expect(result.platform).toBe('dynamics-365-scm')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
