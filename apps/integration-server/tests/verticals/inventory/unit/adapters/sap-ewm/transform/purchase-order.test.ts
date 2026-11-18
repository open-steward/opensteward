import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawSapEwmInboundDelivery,
} from '../../../../../../../src/verticals/inventory/adapters/sap-ewm/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('sap-ewm transformPurchaseOrder', () => {
  const raw: RawSapEwmInboundDelivery = {
    InboundDelivery: '0180000001',
    Supplier: 'SUP001',
    WarehouseNumber: 'WH01',
    StorageLocation: 'SL01',
    OverallDeliveryStatus: 'A',
    DocumentDate: '2024-03-01T00:00:00Z',
    DeliveryDate: '2024-03-01T00:00:00Z',
    DocumentCurrency: 'USD',
    NetValueOfOrderItem: 500.0,
    PurchaseOrder: 'PO-1042',
    to_WhseInbDeliveryItem: {
      results: [
        {
          InboundDelivery: '0180000001',
          DeliveryDocumentItem: '000010',
          Product: 'MAT-001',
          ActualDeliveryQuantity: 10,
          OpenDeliveryQuantity: 10,
          NetAmount: 250.0,
        },
      ],
    },
  }

  it('maps id from InboundDelivery', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('0180000001')
  })

  it('maps number from PurchaseOrder field', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-1042')
  })

  it('maps supplierId from Supplier', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('SUP001')
  })

  it('maps destinationLocationId as WarehouseNumber:StorageLocation', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('WH01:SL01')
  })

  it('destinationLocationId is just WarehouseNumber when StorageLocation absent', () => {
    const result = transformPurchaseOrder({ ...raw, StorageLocation: undefined })
    expect(result.destinationLocationId).toBe('WH01')
  })

  it('OverallDeliveryStatus "A" → status sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('OverallDeliveryStatus "B" → status partially_received', () => {
    const result = transformPurchaseOrder({ ...raw, OverallDeliveryStatus: 'B' })
    expect(result.status).toBe('partially_received')
  })

  it('OverallDeliveryStatus "C" → status received', () => {
    const result = transformPurchaseOrder({ ...raw, OverallDeliveryStatus: 'C' })
    expect(result.status).toBe('received')
  })

  it('maps currency from DocumentCurrency', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBe('USD')
  })

  it('maps lines from to_WhseInbDeliveryItem results', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('MAT-001')
    expect(result.lines[0].quantityOrdered).toBe(10)
    // quantityReceived = ActualDeliveryQuantity - OpenDeliveryQuantity = 10 - 10 = 0
    expect(result.lines[0].quantityReceived).toBe(0)
  })

  it('platform is sap-ewm', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('sap-ewm')
  })

  it('produces output satisfying PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
