import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawCrunchtimePurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/crunchtime/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('crunchtime transformPurchaseOrder', () => {
  it('uses purchaseOrderNumber as id, externalId, and number', () => {
    const raw: RawCrunchtimePurchaseOrder = {
      purchaseOrderNumber: 'PO-2024-001',
      vendorCode: 'VEN-001',
      status: 'SUBMITTED',
    }
    const result = transformPurchaseOrder(raw)

    expect(result.id).toBe('PO-2024-001')
    expect(result.externalId).toBe('PO-2024-001')
    expect(result.number).toBe('PO-2024-001')
  })

  it('maps vendorCode to supplierId', () => {
    const raw: RawCrunchtimePurchaseOrder = {
      purchaseOrderNumber: 'PO-001',
      vendorCode: 'VEN-BREAD',
    }
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('VEN-BREAD')
  })

  it('falls back to vendorName when vendorCode is absent', () => {
    const raw: RawCrunchtimePurchaseOrder = {
      purchaseOrderNumber: 'PO-002',
      vendorName: 'Bread Supplier Inc',
    }
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('Bread Supplier Inc')
  })

  it('maps SUBMITTED status to sent', () => {
    const raw: RawCrunchtimePurchaseOrder = {
      purchaseOrderNumber: 'PO-003',
      vendorCode: 'VEN-001',
      status: 'SUBMITTED',
    }
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps RECEIVED status to received', () => {
    const raw: RawCrunchtimePurchaseOrder = {
      purchaseOrderNumber: 'PO-004',
      vendorCode: 'VEN-001',
      status: 'RECEIVED',
    }
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('received')
  })

  it('maps PARTIALLY RECEIVED status to partially_received', () => {
    const raw: RawCrunchtimePurchaseOrder = {
      purchaseOrderNumber: 'PO-005',
      vendorCode: 'VEN-001',
      status: 'PARTIALLY RECEIVED',
    }
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('partially_received')
  })

  it('maps CANCELLED status to cancelled', () => {
    const raw: RawCrunchtimePurchaseOrder = {
      purchaseOrderNumber: 'PO-006',
      vendorCode: 'VEN-001',
      status: 'CANCELLED',
    }
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('cancelled')
  })

  it('maps CLOSED status to closed', () => {
    const raw: RawCrunchtimePurchaseOrder = {
      purchaseOrderNumber: 'PO-007',
      vendorCode: 'VEN-001',
      status: 'CLOSED',
    }
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('closed')
  })

  it('defaults unknown status to draft', () => {
    const raw: RawCrunchtimePurchaseOrder = {
      purchaseOrderNumber: 'PO-008',
      vendorCode: 'VEN-001',
      status: 'UNKNOWN_STATUS',
    }
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('draft')
  })

  it('converts decimal dollar amounts to integer cents', () => {
    const raw: RawCrunchtimePurchaseOrder = {
      purchaseOrderNumber: 'PO-009',
      vendorCode: 'VEN-001',
      subTotal: 100.5,
      orderTotal: 110.75,
    }
    const result = transformPurchaseOrder(raw)
    expect(result.subtotalAmount).toBe(10050)
    expect(result.totalAmount).toBe(11075)
  })

  it('maps orderDate to orderedAt', () => {
    const raw: RawCrunchtimePurchaseOrder = {
      purchaseOrderNumber: 'PO-010',
      vendorCode: 'VEN-001',
      orderDate: '2024-03-01T00:00:00Z',
    }
    const result = transformPurchaseOrder(raw)
    // toIso normalises via new Date().toISOString() which may append milliseconds
    expect(result.orderedAt).toContain('2024-03-01')
  })

  it('falls back to submitDate when orderDate is absent', () => {
    const raw: RawCrunchtimePurchaseOrder = {
      purchaseOrderNumber: 'PO-011',
      vendorCode: 'VEN-001',
      submitDate: '2024-03-01T00:00:00Z',
    }
    const result = transformPurchaseOrder(raw)
    // toIso normalises via new Date().toISOString() which may append milliseconds
    expect(result.orderedAt).toContain('2024-03-01')
  })

  it('maps purchase order lines correctly', () => {
    const raw: RawCrunchtimePurchaseOrder = {
      purchaseOrderNumber: 'PO-012',
      vendorCode: 'VEN-001',
      purchaseOrderLines: [
        {
          productNumber: 'PN-100',
          quantity: 50,
          receivedQuantity: 25,
          unitCost: 2.5,
          lineTotal: 125.0,
        },
      ],
    }
    const result = transformPurchaseOrder(raw)

    expect(result.lines).toHaveLength(1)
    const line = result.lines[0]!
    expect(line.productId).toBe('PN-100')
    expect(line.quantityOrdered).toBe(50)
    expect(line.quantityReceived).toBe(25)
    expect(line.unitCost).toBe(250)
    expect(line.lineTotal).toBe(12500)
  })

  it('maps destinationLocationId from locationCode', () => {
    const raw: RawCrunchtimePurchaseOrder = {
      purchaseOrderNumber: 'PO-013',
      vendorCode: 'VEN-001',
      locationCode: 'LOC-001',
    }
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('LOC-001')
  })

  it('passes PurchaseOrderSchema validation', () => {
    const raw: RawCrunchtimePurchaseOrder = {
      purchaseOrderNumber: 'PO-FULL',
      vendorCode: 'VEN-BREAD',
      vendorName: 'Bread Supplier',
      locationCode: 'LOC-001',
      status: 'SUBMITTED',
      currency: 'USD',
      subTotal: 500.0,
      orderTotal: 550.0,
      orderDate: '2024-03-01T00:00:00Z',
      expectedDeliveryDate: '2024-03-01T00:00:00Z',
      purchaseOrderLines: [
        {
          productNumber: 'PN-100',
          quantity: 100,
          receivedQuantity: 0,
          unitCost: 5.0,
          lineTotal: 500.0,
        },
      ],
    }
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
