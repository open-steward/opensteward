import { describe, it, expect } from 'vitest'
import {
  ProductSchema,
  StockLevelSchema,
  LocationSchema,
  SupplierSchema,
  PurchaseOrderSchema,
  StockTransferSchema,
  StockAdjustmentSchema,
  WebhookEventSchema,
} from '../../../../src/verticals/inventory/schema'

describe('inventory canonical schemas', () => {
  it('parses a Product with variant parent', () => {
    const parsed = ProductSchema.parse({
      id: 'p1', externalId: 'p1', sku: 'TSHIRT-RED-M', name: 'Red T-Shirt M',
      isActive: true, supplierIds: ['s1'], platform: 'cin7-core', metadata: {},
      parentProductId: 'p0',
    })
    expect(parsed.parentProductId).toBe('p0')
  })

  it('parses a StockLevel with synthetic id', () => {
    const parsed = StockLevelSchema.parse({
      id: 'p1:l1', productId: 'p1', locationId: 'l1',
      quantityOnHand: 42, platform: 'cin7-core', metadata: {},
    })
    expect(parsed.quantityOnHand).toBe(42)
  })

  it('Product schema refuses image fields', () => {
    const parsed = ProductSchema.parse({
      id: 'p1', externalId: 'p1', sku: 'X', name: 'X',
      isActive: true, supplierIds: [], platform: 'cin7-core', metadata: {},
      imageUrl: 'malicious://path', bomComponents: [],
    } as unknown as Record<string, unknown>)
    expect((parsed as Record<string, unknown>)['imageUrl']).toBeUndefined()
    expect((parsed as Record<string, unknown>)['bomComponents']).toBeUndefined()
  })

  it('Supplier schema refuses banking fields', () => {
    const parsed = SupplierSchema.parse({
      id: 's1', externalId: 's1', name: 'ACME',
      isActive: true, platform: 'cin7-core', metadata: {},
      bankAccount: '999', paymentTerms: 'NET30',
    } as unknown as Record<string, unknown>)
    expect((parsed as Record<string, unknown>)['bankAccount']).toBeUndefined()
    expect((parsed as Record<string, unknown>)['paymentTerms']).toBeUndefined()
  })

  it('parses PurchaseOrder with nested lines', () => {
    const parsed = PurchaseOrderSchema.parse({
      id: 'po1', externalId: 'po1', supplierId: 's1',
      status: 'sent',
      lines: [{ productId: 'p1', quantityOrdered: 10, unitCost: 5.5 }],
      platform: 'cin7-core', metadata: {},
    })
    expect(parsed.lines.length).toBe(1)
    expect(parsed.lines[0]!.unitCost).toBe(5.5)
  })

  it('parses StockTransfer / StockAdjustment / Location / WebhookEvent', () => {
    expect(StockTransferSchema.parse({ id: 't1', externalId: 't1', fromLocationId: 'l1', toLocationId: 'l2', status: 'completed', lines: [], platform: 'cin7-core', metadata: {} }).status).toBe('completed')
    expect(StockAdjustmentSchema.parse({ id: 'a1', externalId: 'a1', locationId: 'l1', reason: 'cycle_count', lines: [], adjustedAt: '2026-01-01T00:00:00.000Z', platform: 'cin7-core', metadata: {} }).reason).toBe('cycle_count')
    expect(LocationSchema.parse({ id: 'l1', externalId: 'l1', name: 'WH1', type: 'warehouse', isActive: true, platform: 'cin7-core', metadata: {} }).type).toBe('warehouse')
    expect(WebhookEventSchema.parse({ platform: 'cin7-core', type: 'Stock.OnHandChanged', resourceType: 'stock-levels', action: 'updated', resourceId: 'p1:l1', payload: {} }).action).toBe('updated')
  })
})
