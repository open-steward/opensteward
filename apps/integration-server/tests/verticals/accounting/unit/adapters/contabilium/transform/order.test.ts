import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type ContabiliumOrder } from '../../../../../../../src/verticals/accounting/adapters/contabilium/transform/order'

function makeOrder(overrides: Partial<ContabiliumOrder> = {}): ContabiliumOrder {
  return {
    id: 65,
    clienteId: 6,
    clienteNombre: 'Cliente S.A.',
    moneda: 'ARS',
    total: 18000,
    fecha: '2024-01-15',
    estado: 'Activo',
    direccionEnvio: 'Calle Envío 1',
    localidadEnvio: 'Rosario',
    provinciaEnvio: 'Santa Fe',
    paisEnvio: 'AR',
    direccionFacturacion: 'Av. Corrientes 100',
    localidadFacturacion: 'Buenos Aires',
    provinciaFacturacion: 'Buenos Aires',
    paisFacturacion: 'AR',
    items: [],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps id to string', () => {
    expect(transformOrder(makeOrder()).id).toBe('65')
  })

  it('maps clienteId to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('6')
  })

  it('maps total', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(18000)
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('maps status ACTIVE', () => {
    expect(transformOrder(makeOrder({ estado: 'Activo' })).status).toBe('ACTIVE')
  })

  it('maps status COMPLETED for Completado', () => {
    expect(transformOrder(makeOrder({ estado: 'Completado' })).status).toBe('COMPLETED')
  })

  it('maps status COMPLETED for Facturado', () => {
    expect(transformOrder(makeOrder({ estado: 'Facturado' })).status).toBe('COMPLETED')
  })

  it('maps status CANCELLED for Cancelado', () => {
    expect(transformOrder(makeOrder({ estado: 'Cancelado' })).status).toBe('CANCELLED')
  })

  it('maps status CANCELLED for Anulado', () => {
    expect(transformOrder(makeOrder({ estado: 'Anulado' })).status).toBe('CANCELLED')
  })

  it('maps fecha to postedAt as Date object', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps shipping address', () => {
    const o = transformOrder(makeOrder())
    expect(o.shippingAddress?.address1).toBe('Calle Envío 1')
    expect(o.shippingAddress?.city).toBe('Rosario')
  })

  it('maps billing address', () => {
    const o = transformOrder(makeOrder())
    expect(o.billingAddress?.address1).toBe('Av. Corrientes 100')
    expect(o.billingAddress?.city).toBe('Buenos Aires')
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
