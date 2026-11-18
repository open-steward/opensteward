import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type XubioOrder } from '../../../../../../../src/verticals/accounting/adapters/xubio/transform/order'

function makeOrder(overrides: Partial<XubioOrder> = {}): XubioOrder {
  return {
    id: 800,
    numero: 'PED-001',
    clienteId: 90,
    moneda: 'ARS',
    fechaEmision: '2025-03-15',
    estado: 'activo',
    total: 20000,
    impuestos: 4200,
    lineas: [
      {
        id: 1,
        productoId: 'P-30',
        descripcion: 'Producto B',
        cantidad: 4,
        precioUnitario: 5000,
        total: 20000,
        impuesto: 4200,
        cuentaId: 'ACC-15',
        descuento: 0,
      },
    ],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('800')
    expect(result.type).toBe('SALES')
    expect(result.contactId).toBe('90')
    expect(result.currency).toBe('ARS')
    expect(result.totalAmount).toBe(20000)
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps completado to COMPLETED', () => {
    const result = transformOrder(makeOrder({ estado: 'completado' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps facturado to COMPLETED', () => {
    const result = transformOrder(makeOrder({ estado: 'facturado' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps cancelado to CANCELLED', () => {
    const result = transformOrder(makeOrder({ estado: 'cancelado' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps borrador to DRAFT', () => {
    const result = transformOrder(makeOrder({ estado: 'borrador' }))
    expect(result.status).toBe('DRAFT')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
