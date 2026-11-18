import { describe, it, expect } from 'vitest'
import { transformOrder } from '../../../../../../../src/verticals/logistics/adapters/elogii/transform/order'
import type { ElogiiTask } from '../../../../../../../src/verticals/logistics/adapters/elogii/transform/shipment'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeTask(o: Partial<ElogiiTask> = {}): ElogiiTask {
  return {
    _id: 'elo-ord-001',
    state: 3,
    orderNumber: 'ORD-ELO-ORD-001',
    contact: { name: 'Bob Customer', phone: '+15551110000', email: 'bob@example.com' },
    location: {
      address: {
        street: '22 Customer Way',
        city: 'Phoenix',
        state: 'AZ',
        country: 'US',
        postcode: '85001',
      },
    },
    pickupContact: { name: 'Sender Corp' },
    pickupLocation: {
      address: {
        street: '5 Origin Blvd',
        city: 'Tucson',
        state: 'AZ',
        country: 'US',
        postcode: '85701',
      },
    },
    note: 'Deliver between 9-5',
    completedAt: '2024-03-01T14:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T14:00:00Z',
    ...o,
  }
}

describe('elogii transformOrder', () => {
  it('maps _id to id', () => {
    expect(transformOrder(makeTask()).id).toBe('elo-ord-001')
  })

  it('maps orderNumber', () => {
    expect(transformOrder(makeTask()).orderNumber).toBe('ORD-ELO-ORD-001')
  })

  it('falls back to externalId for orderNumber when orderNumber absent', () => {
    expect(transformOrder(makeTask({ orderNumber: null, externalId: 'EXT-ORD' })).orderNumber).toBe(
      'EXT-ORD',
    )
  })

  it('falls back to _id for orderNumber when both absent', () => {
    expect(transformOrder(makeTask({ orderNumber: null })).orderNumber).toBe('elo-ord-001')
  })

  it('state 0 → PENDING', () => {
    expect(transformOrder(makeTask({ state: 0 })).status).toBe('PENDING')
  })

  it('state 1 → PROCESSING', () => {
    expect(transformOrder(makeTask({ state: 1 })).status).toBe('PROCESSING')
  })

  it('state 2 → AWAITING_SHIPMENT', () => {
    expect(transformOrder(makeTask({ state: 2 })).status).toBe('AWAITING_SHIPMENT')
  })

  it('state 3 → DELIVERED', () => {
    expect(transformOrder(makeTask()).status).toBe('DELIVERED')
  })

  it('state 4 → RETURNED', () => {
    expect(transformOrder(makeTask({ state: 4 })).status).toBe('RETURNED')
  })

  it('state 5 → CANCELLED', () => {
    expect(transformOrder(makeTask({ state: 5 })).status).toBe('CANCELLED')
  })

  it('null state → UNKNOWN', () => {
    expect(transformOrder(makeTask({ state: null })).status).toBe('UNKNOWN')
  })

  it('maps destination address city', () => {
    expect(transformOrder(makeTask()).destinationAddress?.city).toBe('Phoenix')
  })

  it('maps destination contact name to address name', () => {
    expect(transformOrder(makeTask()).destinationAddress?.name).toBe('Bob Customer')
  })

  it('maps origin address city', () => {
    expect(transformOrder(makeTask()).originAddress?.city).toBe('Tucson')
  })

  it('maps note to notes', () => {
    expect(transformOrder(makeTask()).notes).toBe('Deliver between 9-5')
  })

  it('parses completedAt to deliveredAt as Date', () => {
    expect(transformOrder(makeTask()).deliveredAt).toBeInstanceOf(Date)
  })

  it('parses createdAt as Date', () => {
    expect(transformOrder(makeTask()).createdAt).toBeInstanceOf(Date)
  })

  it('cancelledAt is set when state is 5', () => {
    expect(transformOrder(makeTask({ state: 5 })).cancelledAt).toBeInstanceOf(Date)
  })

  it('cancelledAt is undefined when state is not 5', () => {
    expect(transformOrder(makeTask({ state: 3 })).cancelledAt).toBeUndefined()
  })

  it('passes OrderSchema validation', () => {
    const result = transformOrder(makeTask())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('metadata includes _platform key', () => {
    const result = transformOrder(makeTask())
    expect(result.metadata?._platform).toBe('elogii')
  })
})
