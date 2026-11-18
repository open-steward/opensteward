import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawMabangPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/mabang-erp/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('mabang-erp transformPurchaseOrder', () => {
  const raw: RawMabangPurchaseOrder = {
    purchaseId: '8001',
    orderBillNO: 'PO-2024-0001',
    providerName: 'Acme Supplier',
    providerId: '999',
    warehouseName: 'Main Warehouse',
    warehouseCode: 'WH-01',
    status: '1',
    currency: 'USD',
    totalMoney: 500.0,
    expressMoney: 25.0,
    estimatedTime: '2024-03-01T00:00:00Z',
    timeCreated: '2024-03-01T00:00:00Z',
    timeCompleted: undefined,
    stockList: [
      {
        stockSku: 'MB-SKU-001',
        stockId: '12345',
        price: 50.0,
        purchaseNum: 10,
        receivedNum: 0,
        totalMoney: 500.0,
        remark: 'Standard order',
      },
    ],
  }

  it('maps id and externalId from purchaseId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('8001')
    expect(result.externalId).toBe('8001')
  })

  it('maps number from orderBillNO', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-2024-0001')
  })

  it('maps supplierId from providerId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('999')
  })

  it('maps destinationLocationId from warehouseCode', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('WH-01')
  })

  it('maps status 1 to draft', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('draft')
  })

  it('maps status 2 to sent', () => {
    const result = transformPurchaseOrder({ ...raw, status: '2' })
    expect(result.status).toBe('sent')
  })

  it('maps status 3 to partially_received', () => {
    const result = transformPurchaseOrder({ ...raw, status: '3' })
    expect(result.status).toBe('partially_received')
  })

  it('maps status 4 to received', () => {
    const result = transformPurchaseOrder({ ...raw, status: '4' })
    expect(result.status).toBe('received')
  })

  it('maps status 5 to cancelled', () => {
    const result = transformPurchaseOrder({ ...raw, status: '5' })
    expect(result.status).toBe('cancelled')
  })

  it('maps currency', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBe('USD')
  })

  it('maps lines from stockList', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('12345')
    expect(result.lines[0].quantityOrdered).toBe(10)
    expect(result.lines[0].unitCost).toBe(50.0)
  })

  it('maps expectedAt from estimatedTime', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to mabang-erp', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('mabang-erp')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(raw))).not.toThrow()
  })
})
