import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type XubioPurchaseOrder,
  type XubioPurchaseOrderLine,
} from '../../../../../../../src/verticals/accounting/adapters/xubio/transform/purchaseorder'

function makeLine(overrides: Partial<XubioPurchaseOrderLine> = {}): XubioPurchaseOrderLine {
  return {
    id: 1,
    productoId: 'PROD-A',
    descripcion: 'Product A',
    cantidad: 5,
    precioUnitario: 200,
    total: 1000,
    impuesto: 210,
    cuentaId: 'acc-4000',
    ...overrides,
  }
}

function makePurchaseOrder(overrides: Partial<XubioPurchaseOrder> = {}): XubioPurchaseOrder {
  return {
    id: 42,
    numero: 'OC-001',
    proveedorId: 10,
    moneda: 'ARS',
    fechaEmision: '2024-01-15',
    estado: 'activo',
    total: 1000,
    impuestos: 210,
    lineas: [makeLine()],
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps id as string', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('42')
  })

  it('maps proveedorId to contactId as string', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.contactId).toBe('10')
  })

  it('maps moneda to currency', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.currency).toBe('ARS')
  })

  it('maps total to totalAmount', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.totalAmount).toBe(1000)
  })

  it('parses fechaEmision as postedAt Date', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps estado activo to ACTIVE', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ estado: 'activo' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps estado recibido to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ estado: 'recibido' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps estado completado to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ estado: 'completado' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps estado cancelado to CANCELLED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ estado: 'cancelado' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps estado anulado to CANCELLED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ estado: 'anulado' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps estado borrador to DRAFT', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ estado: 'borrador' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps lineas to lineItems', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemId).toBe('PROD-A')
    expect(li.itemDescription).toBe('Product A')
    expect(li.unitQuantity).toBe(5)
    expect(li.unitAmount).toBe(200)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(210)
    expect(li.accountId).toBe('acc-4000')
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
