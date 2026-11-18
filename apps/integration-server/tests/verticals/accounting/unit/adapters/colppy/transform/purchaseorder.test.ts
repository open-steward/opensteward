import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type ColppyPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/colppy/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<ColppyPurchaseOrder> = {}): ColppyPurchaseOrder {
  return {
    idOrdenCompra: 900,
    idProveedor: 30,
    nombreProveedor: 'Proveedor Industrial SA',
    moneda: 'ARS',
    total: 80000,
    fechaOrden: '2025-08-01',
    estado: 'pendiente',
    direccionEntrega: 'Ruta 9 km 320',
    ciudadEntrega: 'Córdoba',
    codigoPostalEntrega: 'X5000',
    paisEntrega: 'AR',
    referenciaNuestra: 'OC-100',
    referenciaSuya: 'COT-555',
    items: [
      {
        idItem: 1,
        codigoArticulo: 'MAT-01',
        descripcion: 'Materia prima',
        precioUnitario: 40000,
        cantidad: 2,
        total: 80000,
        idCuenta: 60,
      },
    ],
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('900')
    expect(result.contactId).toBe('30')
    expect(result.currency).toBe('ARS')
    expect(result.totalAmount).toBe(80000)
  })

  it('passes raw object as metadata', () => {
    const raw = makePurchaseOrder()
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps completed status for recibido', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ estado: 'recibido' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps cancelled status', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ estado: 'cancelado' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps shipping address', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.shippingAddress?.city).toBe('Córdoba')
  })

  it('returns undefined shipping address when no address fields', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ direccionEntrega: '', ciudadEntrega: '' }))
    expect(result.shippingAddress).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
