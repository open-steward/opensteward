import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type ChipaxOrder } from '../../../../../../../src/verticals/accounting/adapters/chipax/transform/order'

function makeOrder(overrides: Partial<ChipaxOrder> = {}): ChipaxOrder {
  return {
    id: 600,
    clienteId: 10,
    clienteNombre: 'Cliente SA',
    moneda: 'CLP',
    total: 150000,
    fechaPedido: '2025-03-01',
    estado: 'pendiente',
    direccionDespacho: 'Calle 123',
    ciudadDespacho: 'Santiago',
    comunaDespacho: 'Las Condes',
    paisDespacho: 'CL',
    direccionFacturacion: 'Av. Principal 456',
    ciudadFacturacion: 'Santiago',
    comunaFacturacion: 'Providencia',
    paisFacturacion: 'CL',
    lineas: [
      {
        id: 1,
        productoId: 'P-1',
        descripcion: 'Producto A',
        precioUnitario: 150000,
        cantidad: 1,
        total: 150000,
        impuesto: 28500,
        cuentaId: '4100',
        descuento: 0,
      },
    ],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('600')
    expect(result.type).toBe('SALES')
    expect(result.contactId).toBe('10')
    expect(result.currency).toBe('CLP')
    expect(result.totalAmount).toBe(150000)
  })

  it('maps completed status', () => {
    const result = transformOrder(makeOrder({ estado: 'completado' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps cancelled status', () => {
    const result = transformOrder(makeOrder({ estado: 'cancelado' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps default status to ACTIVE', () => {
    const result = transformOrder(makeOrder({ estado: 'pendiente' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps shipping and billing addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress?.city).toBe('Santiago')
    expect(result.billingAddress?.city).toBe('Santiago')
    expect(result.billingAddress?.region).toBe('Providencia')
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
