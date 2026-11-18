import { describe, it, expect } from 'vitest'
import { transformShipment } from '../../../../../../../src/verticals/logistics/adapters/glovo/transform/shipment'
import type { GlovoOrder } from '../../../../../../../src/verticals/logistics/adapters/glovo/transform/order'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeOrder(overrides: Partial<GlovoOrder> = {}): GlovoOrder {
  return {
    id: 'GLV-002',
    state: 'IN_TRANSIT',
    description: 'Birthday cake',
    total: { amount: 500, currency: 'EUR' },
    addresses: [
      {
        lat: 41.39,
        lon: 2.17,
        label: 'pickup bakery, Eixample',
        contactPerson: 'Ana Bakery',
        contactPhone: '+34611111111',
      },
      {
        lat: 41.38,
        lon: 2.16,
        label: '5 Recipient Ave, Barcelona',
        contactPerson: 'John Doe',
        contactPhone: '+34622222222',
      },
    ],
    createdAt: '2024-03-01T12:00:00Z',
    updatedAt: '2024-03-01T13:00:00Z',
    ...overrides,
  }
}

describe('Glovo transformShipment', () => {
  it('maps id from raw.id', () => {
    expect(transformShipment(makeOrder()).id).toBe('GLV-002')
  })

  it('sets carrierId to glovo', () => {
    expect(transformShipment(makeOrder()).carrierId).toBe('glovo')
  })

  it('maps IN_TRANSIT state → IN_TRANSIT status', () => {
    expect(transformShipment(makeOrder({ state: 'IN_TRANSIT' })).status).toBe('IN_TRANSIT')
  })

  it('maps ON_THE_WAY state → IN_TRANSIT status', () => {
    expect(transformShipment(makeOrder({ state: 'ON_THE_WAY' })).status).toBe('IN_TRANSIT')
  })

  it('maps PENDING state → PENDING status', () => {
    expect(transformShipment(makeOrder({ state: 'PENDING' })).status).toBe('PENDING')
  })

  it('maps ACCEPTED state → LABEL_CREATED status', () => {
    expect(transformShipment(makeOrder({ state: 'ACCEPTED' })).status).toBe('LABEL_CREATED')
  })

  it('maps PICKING state → LABEL_CREATED status', () => {
    expect(transformShipment(makeOrder({ state: 'PICKING' })).status).toBe('LABEL_CREATED')
  })

  it('maps DELIVERED state → DELIVERED status', () => {
    expect(transformShipment(makeOrder({ state: 'DELIVERED' })).status).toBe('DELIVERED')
  })

  it('maps CANCELED state → CANCELLED status', () => {
    expect(transformShipment(makeOrder({ state: 'CANCELED' })).status).toBe('CANCELLED')
  })

  it('maps CANCELLED state → CANCELLED status', () => {
    expect(transformShipment(makeOrder({ state: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('maps unknown state → UNKNOWN status', () => {
    expect(transformShipment(makeOrder({ state: 'MYSTERY' })).status).toBe('UNKNOWN')
  })

  it('sets mode to parcel', () => {
    expect(transformShipment(makeOrder()).mode).toBe('parcel')
  })

  it('maps originAddress from pickup-labelled address', () => {
    const result = transformShipment(makeOrder())
    expect(result.originAddress?.street1).toBe('pickup bakery, Eixample')
    expect(result.originAddress?.name).toBe('Ana Bakery')
    expect(result.originAddress?.phone).toBe('+34611111111')
  })

  it('maps destinationAddress from non-pickup address', () => {
    const result = transformShipment(makeOrder())
    expect(result.destinationAddress?.street1).toBe('5 Recipient Ave, Barcelona')
    expect(result.destinationAddress?.name).toBe('John Doe')
    expect(result.destinationAddress?.phone).toBe('+34622222222')
  })

  it('maps cost amount and currency', () => {
    const result = transformShipment(makeOrder())
    expect(result.cost?.amount).toBe(500)
    expect(result.cost?.currency).toBe('EUR')
  })

  it('omits cost when total is null', () => {
    const result = transformShipment(makeOrder({ total: null }))
    expect(result.cost).toBeUndefined()
  })

  it('omits cost when amount is null', () => {
    const result = transformShipment(makeOrder({ total: { amount: null, currency: 'EUR' } }))
    expect(result.cost).toBeUndefined()
  })

  it('maps notes from description', () => {
    expect(transformShipment(makeOrder()).notes).toBe('Birthday cake')
  })

  it('maps createdAt from createdAt field', () => {
    expect(transformShipment(makeOrder()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt from updatedAt field', () => {
    expect(transformShipment(makeOrder()).updatedAt).toBeInstanceOf(Date)
  })

  it('attaches metadata as the raw object', () => {
    const raw = makeOrder()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles empty addresses array', () => {
    const result = transformShipment(makeOrder({ addresses: [] }))
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
  })

  it('produces output that parses against ShipmentSchema', () => {
    const result = transformShipment(makeOrder())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
