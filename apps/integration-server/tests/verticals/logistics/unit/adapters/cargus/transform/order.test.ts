import { describe, it, expect } from 'vitest'
import { transformOrder } from '../../../../../../../src/verticals/logistics/adapters/cargus/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'
import { documentedOrder } from '../fixtures/documented'

describe('cargus transformOrder (documented order)', () => {
  it('parses against OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(documentedOrder(501)))).not.toThrow()
  })

  it('maps OrderId, LocationId (the pickup location = Warehouse id) and Observations', () => {
    const o = OrderSchema.parse(transformOrder(documentedOrder(501)))
    expect(o.id).toBe('501')
    expect(o.orderNumber).toBe('501')
    expect(o.warehouseId).toBe('201')
    expect(o.notes).toBe('Poarta 2')
  })

  it('maps CreationDate to orderAt and createdAt', () => {
    const o = OrderSchema.parse(transformOrder(documentedOrder(501)))
    expect(o.createdAt?.toISOString()).toBe('2026-09-20T08:30:00.000Z')
    expect(o.orderAt?.toISOString()).toBe('2026-09-20T08:30:00.000Z')
  })

  it('status is unknown: OrdStatus values are not documented', () => {
    expect(OrderSchema.parse(transformOrder(documentedOrder(501))).status).toBe('unknown')
    expect(transformOrder({ ...documentedOrder(502), OrdStatus: 0 }).status).toBe('unknown')
  })

  it('does not invent shippedAt or updatedAt', () => {
    const o = OrderSchema.parse(transformOrder(documentedOrder(501)))
    expect(o.shippedAt).toBeUndefined()
    expect(o.updatedAt).toBeUndefined()
  })

  it('throws on an order without an OrderId rather than inventing one', () => {
    expect(() => transformOrder({ ...documentedOrder(1), OrderId: null })).toThrow(/OrderId/)
  })
})
