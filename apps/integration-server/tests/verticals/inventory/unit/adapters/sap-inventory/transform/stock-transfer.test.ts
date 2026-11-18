import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawSapStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/sap-inventory/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('sap-inventory transformStockTransfer', () => {
  const raw: RawSapStockTransfer = {
    PurchaseOrder: 'STO-001',
    PurchaseOrderType: 'UB',
    Supplier: '2000',
    DocumentCurrency: 'USD',
    PurchaseOrderDate: '2024-03-01T00:00:00Z',
    to_PurchaseOrderItem: {
      results: [
        {
          PurchaseOrderItem: '10',
          Material: 'MAT-001',
          Plant: '1000',
          StorageLocation: '0001',
          ReceivingPlant: '2000',
          OrderQuantity: 50,
          GoodsReceiptQty: 0,
        },
      ],
    },
  }

  it('maps id from PurchaseOrder', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('STO-001')
  })

  it('maps fromLocationId as Plant:StorageLocation of first item', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('1000:0001')
  })

  it('fromLocationId is just Plant when StorageLocation absent on first item', () => {
    const result = transformStockTransfer({
      ...raw,
      to_PurchaseOrderItem: {
        results: [
          {
            Material: 'MAT-001',
            Plant: '1000',
            ReceivingPlant: '2000',
            OrderQuantity: 10,
            GoodsReceiptQty: 0,
          },
        ],
      },
    })
    expect(result.fromLocationId).toBe('1000')
  })

  it('maps toLocationId from ReceivingPlant of first item', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('2000')
  })

  it('GoodsReceiptQty 0 → status draft', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('draft')
  })

  it('GoodsReceiptQty equals OrderQuantity → status completed', () => {
    const result = transformStockTransfer({
      ...raw,
      to_PurchaseOrderItem: {
        results: [
          {
            Material: 'MAT-001',
            Plant: '1000',
            ReceivingPlant: '2000',
            OrderQuantity: 50,
            GoodsReceiptQty: 50,
          },
        ],
      },
    })
    expect(result.status).toBe('completed')
  })

  it('partial GoodsReceiptQty → status in_transit', () => {
    const result = transformStockTransfer({
      ...raw,
      to_PurchaseOrderItem: {
        results: [
          {
            Material: 'MAT-001',
            Plant: '1000',
            ReceivingPlant: '2000',
            OrderQuantity: 50,
            GoodsReceiptQty: 25,
          },
        ],
      },
    })
    expect(result.status).toBe('in_transit')
  })

  it('maps lines with productId and quantity', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('MAT-001')
    expect(result.lines[0].quantity).toBe(50)
    expect(result.lines[0].quantityReceived).toBe(0)
  })

  it('maps shippedAt from PurchaseOrderDate', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('platform is sap-inventory', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('sap-inventory')
  })

  it('produces output satisfying StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
