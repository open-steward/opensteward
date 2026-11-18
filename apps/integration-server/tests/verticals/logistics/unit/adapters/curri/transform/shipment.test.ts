import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type CurriDelivery,
} from '../../../../../../../src/verticals/logistics/adapters/curri/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeDelivery(o: Partial<CurriDelivery> = {}): CurriDelivery {
  return {
    id: 'del-456',
    createdAt: '2024-03-01T00:00:00Z',
    deliveredAt: null,
    price: 2000,
    deliveryMethod: 'Standard',
    deliveryStatus: { code: 'en_route_to_destination', name: 'En Route to Destination' },
    origin: {
      name: 'Warehouse',
      addressLine1: '100 Main St',
      city: 'Dallas',
      state: 'TX',
      postalCode: '75201',
    },
    destination: {
      name: 'Customer',
      addressLine1: '200 Oak Ave',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
    },
    trackingUrl: 'https://tracking.curri.com/del-456',
    deliveryMeta: {
      orderNumber: 'ORD-999',
      poNumber: 'PO-888',
    },
    ...o,
  }
}

describe('curri transformShipment', () => {
  it('maps id', () => {
    const result = transformShipment(makeDelivery())
    expect(result.id).toBe('del-456')
  })

  it('maps trackingNumber to id', () => {
    const result = transformShipment(makeDelivery())
    expect(result.trackingNumber).toBe('del-456')
  })

  it('maps carrierId to curri', () => {
    const result = transformShipment(makeDelivery())
    expect(result.carrierId).toBe('curri')
  })

  it('maps en_route_to_destination status to IN_TRANSIT', () => {
    const result = transformShipment(makeDelivery())
    expect(result.status).toBe('IN_TRANSIT')
  })

  it('maps pending status to LABEL_CREATED', () => {
    const result = transformShipment(makeDelivery({ deliveryStatus: { code: 'pending' } }))
    expect(result.status).toBe('LABEL_CREATED')
  })

  it('maps delivered status to DELIVERED', () => {
    const result = transformShipment(makeDelivery({ deliveryStatus: { code: 'delivered' } }))
    expect(result.status).toBe('DELIVERED')
  })

  it('maps at_destination to OUT_FOR_DELIVERY', () => {
    const result = transformShipment(makeDelivery({ deliveryStatus: { code: 'at_destination' } }))
    expect(result.status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps cancelled to CANCELLED', () => {
    const result = transformShipment(makeDelivery({ deliveryStatus: { code: 'canceled' } }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps unknown status to UNKNOWN', () => {
    const result = transformShipment(makeDelivery({ deliveryStatus: { code: 'something_else' } }))
    expect(result.status).toBe('UNKNOWN')
  })

  it('maps price to cost in USD', () => {
    const result = transformShipment(makeDelivery({ price: 2000 }))
    expect(result.cost).toEqual({ amount: 2000, currency: 'USD' })
  })

  it('sets cost to undefined when price is null', () => {
    const result = transformShipment(makeDelivery({ price: null }))
    expect(result.cost).toBeUndefined()
  })

  it('maps trackingUrl to labelUrl', () => {
    const result = transformShipment(makeDelivery())
    expect(result.labelUrl).toBe('https://tracking.curri.com/del-456')
  })

  it('maps orderNumber to reference', () => {
    const result = transformShipment(makeDelivery())
    expect(result.reference).toBe('ORD-999')
  })

  it('maps pickupNote to notes', () => {
    const result = transformShipment(
      makeDelivery({ deliveryMeta: { pickupNote: 'Ring doorbell' } }),
    )
    expect(result.notes).toBe('Ring doorbell')
  })

  it('maps destination address fields', () => {
    const result = transformShipment(makeDelivery())
    expect(result.destinationAddress?.city).toBe('Austin')
    expect(result.destinationAddress?.state).toBe('TX')
  })

  it('maps origin address fields', () => {
    const result = transformShipment(makeDelivery())
    expect(result.originAddress?.city).toBe('Dallas')
  })

  it('maps createdAt date', () => {
    const result = transformShipment(makeDelivery())
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema validation', () => {
    const result = transformShipment(makeDelivery())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('passes ShipmentSchema validation with minimal input', () => {
    const result = transformShipment({ id: 'x' })
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
