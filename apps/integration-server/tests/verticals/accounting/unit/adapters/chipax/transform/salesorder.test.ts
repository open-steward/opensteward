import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type ChipaxSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/chipax/transform/salesorder'

function makeSalesOrder(overrides: Partial<ChipaxSalesOrder> = {}): ChipaxSalesOrder {
  return {
    id: 800,
    clienteId: 12,
    clienteNombre: 'Cliente SpA',
    moneda: 'CLP',
    total: 350000,
    fechaPedido: '2025-04-01',
    estado: 'pendiente',
    direccionDespacho: 'Calle 789',
    ciudadDespacho: 'Valparaíso',
    comunaDespacho: 'Viña del Mar',
    paisDespacho: 'CL',
    direccionFacturacion: 'Av. Central 100',
    ciudadFacturacion: 'Santiago',
    comunaFacturacion: 'Las Condes',
    paisFacturacion: 'CL',
    lineas: [
      {
        id: 1,
        productoId: 'SRV-1',
        descripcion: 'Servicio mensual',
        precioUnitario: 350000,
        cantidad: 1,
        total: 350000,
        impuesto: 66500,
        cuentaId: '4100',
        descuento: 0,
      },
    ],
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('800')
    expect(result.contactId).toBe('12')
    expect(result.currency).toBe('CLP')
    expect(result.totalAmount).toBe(350000)
  })

  it('maps completed status for facturado', () => {
    const result = transformSalesOrder(makeSalesOrder({ estado: 'facturado' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps cancelled status for anulado', () => {
    const result = transformSalesOrder(makeSalesOrder({ estado: 'anulado' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps shipping and billing addresses', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.shippingAddress?.city).toBe('Valparaíso')
    expect(result.billingAddress?.city).toBe('Santiago')
  })

  it('returns undefined addresses when empty', () => {
    const result = transformSalesOrder(makeSalesOrder({
      direccionDespacho: '', ciudadDespacho: '',
      direccionFacturacion: '', ciudadFacturacion: '',
    }))
    expect(result.shippingAddress).toBeUndefined()
    expect(result.billingAddress).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeSalesOrder()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
