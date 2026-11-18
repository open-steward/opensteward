import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type ChipaxPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/chipax/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<ChipaxPurchaseOrder> = {}): ChipaxPurchaseOrder {
  return {
    id: 700,
    proveedorId: 30,
    proveedorNombre: 'Proveedor SA',
    moneda: 'CLP',
    total: 500000,
    fechaPedido: '2025-02-01',
    estado: 'pendiente',
    direccionEntrega: 'Bodega 5',
    ciudadEntrega: 'Santiago',
    comunaEntrega: 'Quilicura',
    paisEntrega: 'CL',
    referencia: 'OC-200',
    lineas: [
      {
        id: 1,
        productoId: 'MAT-1',
        descripcion: 'Materia prima',
        precioUnitario: 500000,
        cantidad: 1,
        total: 500000,
        cuentaId: '5200',
      },
    ],
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('700')
    expect(result.contactId).toBe('30')
    expect(result.currency).toBe('CLP')
    expect(result.totalAmount).toBe(500000)
  })

  it('maps completed status', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ estado: 'recibido' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps cancelled status', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ estado: 'cancelado' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps default status to ACTIVE', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.status).toBe('ACTIVE')
  })

  it('maps shipping address', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.shippingAddress?.address1).toBe('Bodega 5')
    expect(result.shippingAddress?.city).toBe('Santiago')
  })

  it('passes raw object as metadata', () => {
    const raw = makePurchaseOrder()
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
