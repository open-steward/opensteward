import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type BorzoOrder,
} from '../../../../../../../src/verticals/logistics/adapters/borzo/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeOrder(overrides: Partial<BorzoOrder> = {}): BorzoOrder {
  return {
    order_id: 98765,
    order_name: 'BORZO-98765',
    status: 'active',
    payment_amount: '350.00',
    delivery_fee_amount: '80.00',
    matter: 'Documents',
    vehicle_type_id: 8,
    points: [
      {
        address: '10 Main Street, Mumbai',
        contact_person: { name: 'Alice', phone: '+919876543210' },
      },
      {
        address: '20 Park Avenue, Delhi',
        contact_person: { name: 'Bob', phone: '+911234567890' },
      },
    ],
    courier: { name: 'Ravi Kumar', phone: '+919988776655' },
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformShipment (borzo)', () => {
  it('maps id from order_id', () => {
    const result = transformShipment(makeOrder())
    expect(result.id).toBe('98765')
  })

  it('maps trackingNumber from order_name', () => {
    const result = transformShipment(makeOrder())
    expect(result.trackingNumber).toBe('BORZO-98765')
  })

  it('sets carrierId to borzo', () => {
    expect(transformShipment(makeOrder()).carrierId).toBe('borzo')
  })

  it('maps status active → IN_TRANSIT', () => {
    expect(transformShipment(makeOrder({ status: 'active' })).status).toBe('IN_TRANSIT')
  })

  it('maps status new → PENDING', () => {
    expect(transformShipment(makeOrder({ status: 'new' })).status).toBe('PENDING')
  })

  it('maps status completed → DELIVERED', () => {
    expect(transformShipment(makeOrder({ status: 'completed' })).status).toBe('DELIVERED')
  })

  it('maps status canceled → CANCELLED', () => {
    expect(transformShipment(makeOrder({ status: 'canceled' })).status).toBe('CANCELLED')
  })

  it('maps unknown status → UNKNOWN', () => {
    expect(transformShipment(makeOrder({ status: 'foobar' })).status).toBe('UNKNOWN')
  })

  it('maps originAddress from first point', () => {
    const result = transformShipment(makeOrder())
    expect(result.originAddress?.street1).toBe('10 Main Street, Mumbai')
    expect(result.originAddress?.name).toBe('Alice')
    expect(result.originAddress?.phone).toBe('+919876543210')
  })

  it('maps destinationAddress from last point', () => {
    const result = transformShipment(makeOrder())
    expect(result.destinationAddress?.street1).toBe('20 Park Avenue, Delhi')
    expect(result.destinationAddress?.name).toBe('Bob')
  })

  it('maps cost from payment_amount with INR currency', () => {
    const result = transformShipment(makeOrder())
    expect(result.cost?.amount).toBe(350)
    expect(result.cost?.currency).toBe('INR')
  })

  it('maps notes from matter', () => {
    expect(transformShipment(makeOrder()).notes).toBe('Documents')
  })

  it('maps createdAt from created_at', () => {
    const result = transformShipment(makeOrder())
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes metadata as original raw object', () => {
    const raw = makeOrder()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformShipment(
      makeOrder({
        order_id: null,
        order_name: null,
        status: null,
        payment_amount: null,
        points: null,
        matter: null,
        created_at: null,
      }),
    )
    expect(result.id).toBeUndefined()
    expect(result.trackingNumber).toBeUndefined()
    expect(result.status).toBe('UNKNOWN')
    expect(result.cost).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.notes).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
  })

  it('produces output that parses against ShipmentSchema', () => {
    const result = transformShipment(makeOrder())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
