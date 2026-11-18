import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type ColppySalesOrder } from '../../../../../../../src/verticals/accounting/adapters/colppy/transform/salesorder'

function makeSalesOrder(overrides: Partial<ColppySalesOrder> = {}): ColppySalesOrder {
  return {
    idOrdenVenta: 1000,
    idCliente: 35,
    nombreCliente: 'Mayorista SA',
    moneda: 'ARS',
    total: 50000,
    fechaOrden: '2025-09-01',
    estado: 'pendiente',
    direccionEntrega: 'Calle 10 nro 500',
    ciudadEntrega: 'La Plata',
    codigoPostalEntrega: 'B1900',
    paisEntrega: 'AR',
    direccionFacturacion: 'Calle 50 nro 800',
    ciudadFacturacion: 'La Plata',
    codigoPostalFacturacion: 'B1900',
    paisFacturacion: 'AR',
    items: [
      {
        idItem: 1,
        codigoArticulo: 'SRV-02',
        descripcion: 'Servicio técnico',
        precioUnitario: 25000,
        cantidad: 2,
        total: 50000,
        iva: 10500,
        idCuenta: 70,
        descuento: 0,
      },
    ],
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('1000')
    expect(result.contactId).toBe('35')
    expect(result.currency).toBe('ARS')
    expect(result.totalAmount).toBe(50000)
  })

  it('passes raw object as metadata', () => {
    const raw = makeSalesOrder()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps completed status for facturado', () => {
    const result = transformSalesOrder(makeSalesOrder({ estado: 'facturado' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps cancelled status', () => {
    const result = transformSalesOrder(makeSalesOrder({ estado: 'cancelado' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps both addresses', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.shippingAddress?.city).toBe('La Plata')
    expect(result.billingAddress?.city).toBe('La Plata')
  })

  it('maps line items with tax and discount', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].taxAmount).toBe(10500)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
