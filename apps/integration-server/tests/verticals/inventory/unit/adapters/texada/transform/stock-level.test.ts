import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawTexadaStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/texada/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('transformStockLevel', () => {
  const base: RawTexadaStockLevel = {
    itemNo: 'ITEM-001',
    branchId: 'branch-001',
    totalUnits: 50,
    availableUnits: 30,
    onRentUnits: 15,
    onOrderUnits: 10,
    inRepairUnits: 5,
    reorderPoint: 8,
    reorderQty: 20,
    lastCountDate: '2024-03-01T00:00:00Z',
  }

  it('builds id as "<productId>:<locationId>"', () => {
    const result = transformStockLevel(base)
    expect(result.id).toBe('ITEM-001:branch-001')
  })

  it('maps itemNo → productId', () => {
    const result = transformStockLevel(base)
    expect(result.productId).toBe('ITEM-001')
  })

  it('maps branchId → locationId', () => {
    const result = transformStockLevel(base)
    expect(result.locationId).toBe('branch-001')
  })

  it('maps totalUnits → quantityOnHand', () => {
    const result = transformStockLevel(base)
    expect(result.quantityOnHand).toBe(50)
  })

  it('maps availableUnits → quantityAvailable', () => {
    const result = transformStockLevel(base)
    expect(result.quantityAvailable).toBe(30)
  })

  it('maps onRentUnits → quantityCommitted', () => {
    const result = transformStockLevel(base)
    expect(result.quantityCommitted).toBe(15)
  })

  it('maps onOrderUnits → quantityIncoming', () => {
    const result = transformStockLevel(base)
    expect(result.quantityIncoming).toBe(10)
  })

  it('maps reorderPoint → reorderPoint', () => {
    const result = transformStockLevel(base)
    expect(result.reorderPoint).toBe(8)
  })

  it('maps reorderQty → reorderQuantity', () => {
    const result = transformStockLevel(base)
    expect(result.reorderQuantity).toBe(20)
  })

  it('maps lastCountDate → lastCountedAt as ISO string', () => {
    const result = transformStockLevel(base)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back productId → productId when itemNo is absent', () => {
    const { itemNo, ...rest } = base
    const result = transformStockLevel({ ...rest, productId: 'PROD-ALT' })
    expect(result.productId).toBe('PROD-ALT')
  })

  it('falls back locationId → locationId when branchId is absent', () => {
    const { branchId, ...rest } = base
    const result = transformStockLevel({ ...rest, locationId: 'LOC-ALT' })
    expect(result.locationId).toBe('LOC-ALT')
  })

  it('falls back branchNo → locationId when branchId and locationId are absent', () => {
    const { branchId, ...rest } = base
    const result = transformStockLevel({ ...rest, branchNo: 'BN-002' })
    expect(result.locationId).toBe('BN-002')
  })

  it('falls back quantityOnHand → quantityOnHand when totalUnits is absent', () => {
    const { totalUnits, ...rest } = base
    const result = transformStockLevel({ ...rest, quantityOnHand: 40 })
    expect(result.quantityOnHand).toBe(40)
  })

  it('falls back onHand → quantityOnHand when totalUnits and quantityOnHand are absent', () => {
    const { totalUnits, ...rest } = base
    const result = transformStockLevel({ ...rest, onHand: 35 })
    expect(result.quantityOnHand).toBe(35)
  })

  it('falls back available → quantityAvailable when availableUnits is absent', () => {
    const { availableUnits, ...rest } = base
    const result = transformStockLevel({ ...rest, available: 28 })
    expect(result.quantityAvailable).toBe(28)
  })

  it('falls back onRent → quantityCommitted when onRentUnits is absent', () => {
    const { onRentUnits, ...rest } = base
    const result = transformStockLevel({ ...rest, onRent: 12 })
    expect(result.quantityCommitted).toBe(12)
  })

  it('falls back committed → quantityCommitted when onRentUnits and onRent are absent', () => {
    const { onRentUnits, ...rest } = base
    const result = transformStockLevel({ ...rest, committed: 11 })
    expect(result.quantityCommitted).toBe(11)
  })

  it('falls back onOrder → quantityIncoming when onOrderUnits is absent', () => {
    const { onOrderUnits, ...rest } = base
    const result = transformStockLevel({ ...rest, onOrder: 8 })
    expect(result.quantityIncoming).toBe(8)
  })

  it('falls back reorderQuantity → reorderQuantity when reorderQty is absent', () => {
    const { reorderQty, ...rest } = base
    const result = transformStockLevel({ ...rest, reorderQuantity: 25 })
    expect(result.reorderQuantity).toBe(25)
  })

  it('falls back lastCounted → lastCountedAt when lastCountDate is absent', () => {
    const { lastCountDate, ...rest } = base
    const result = transformStockLevel({ ...rest, lastCounted: '2024-04-01T00:00:00Z' })
    expect(result.lastCountedAt).toBe('2024-04-01T00:00:00.000Z')
  })

  it('defaults quantityOnHand to 0 when no quantity fields are present', () => {
    const result = transformStockLevel({ itemNo: 'ITEM-001', branchId: 'branch-001' })
    expect(result.quantityOnHand).toBe(0)
  })

  it('sets platform to "texada"', () => {
    const result = transformStockLevel(base)
    expect(result.platform).toBe('texada')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(base)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
