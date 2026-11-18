import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type ColppyOrder } from '../../../../../../../src/verticals/accounting/adapters/colppy/transform/order'

function makeOrder(overrides: Partial<ColppyOrder> = {}): ColppyOrder {
  return {
    idPedido: 800,
    idCliente: 25,
    nombreCliente: 'Minorista SRL',
    moneda: 'ARS',
    total: 15000,
    fechaPedido: '2025-07-15',
    estado: 'pendiente',
    direccionEntrega: 'Av. Santa Fe 2000',
    ciudadEntrega: 'Buenos Aires',
    codigoPostalEntrega: 'C1123',
    paisEntrega: 'AR',
    direccionFacturacion: 'Av. Callao 500',
    ciudadFacturacion: 'Buenos Aires',
    codigoPostalFacturacion: 'C1022',
    paisFacturacion: 'AR',
    items: [
      {
        idItem: 1,
        codigoArticulo: 'PROD-01',
        descripcion: 'Producto A',
        precioUnitario: 5000,
        cantidad: 3,
        total: 15000,
        iva: 3150,
        idCuenta: 40,
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
    expect(result.contactId).toBe('25')
    expect(result.currency).toBe('ARS')
    expect(result.totalAmount).toBe(15000)
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps completed status for facturado', () => {
    const result = transformOrder(makeOrder({ estado: 'facturado' }))
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
    expect(result.shippingAddress?.address1).toBe('Av. Santa Fe 2000')
    expect(result.billingAddress?.address1).toBe('Av. Callao 500')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
