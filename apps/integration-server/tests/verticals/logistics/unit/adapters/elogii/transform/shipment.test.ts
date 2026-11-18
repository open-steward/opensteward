import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type ElogiiTask,
} from '../../../../../../../src/verticals/logistics/adapters/elogii/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeTask(o: Partial<ElogiiTask> = {}): ElogiiTask {
  return {
    _id: 'elo-task-001',
    trackingCode: 'TRK-ELO-001',
    state: 2,
    taskType: 'delivery',
    contact: { name: 'Jane Receiver', phone: '+15559991234', email: 'jane@example.com' },
    location: {
      address: {
        street: '10 Delivery St',
        city: 'Los Angeles',
        state: 'CA',
        country: 'US',
        postcode: '90001',
      },
    },
    pickupContact: { name: 'Origin Sender', phone: '+15558881234' },
    pickupLocation: {
      address: {
        street: '1 Origin Ave',
        city: 'San Diego',
        state: 'CA',
        country: 'US',
        postcode: '92101',
      },
    },
    orderNumber: 'ORD-ELO-001',
    note: 'Fragile item',
    documents: [{ url: 'https://docs.example.com/label-001.pdf' }],
    scheduledAt: '2024-03-01T08:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T12:00:00Z',
    eta: '2024-03-01T14:00:00Z',
    ...o,
  }
}

describe('elogii transformShipment', () => {
  it('maps _id to id', () => {
    expect(transformShipment(makeTask()).id).toBe('elo-task-001')
  })

  it('maps trackingCode to trackingNumber', () => {
    expect(transformShipment(makeTask()).trackingNumber).toBe('TRK-ELO-001')
  })

  it('falls back to externalId when trackingCode absent', () => {
    expect(
      transformShipment(makeTask({ trackingCode: null, externalId: 'EXT-001' })).trackingNumber,
    ).toBe('EXT-001')
  })

  it('falls back to _id when both absent', () => {
    expect(transformShipment(makeTask({ trackingCode: null })).trackingNumber).toBe('elo-task-001')
  })

  it('state 0 → LABEL_CREATED', () => {
    expect(transformShipment(makeTask({ state: 0 })).status).toBe('LABEL_CREATED')
  })

  it('state 1 → PENDING', () => {
    expect(transformShipment(makeTask({ state: 1 })).status).toBe('PENDING')
  })

  it('state 2 → IN_TRANSIT', () => {
    expect(transformShipment(makeTask()).status).toBe('IN_TRANSIT')
  })

  it('state 3 → DELIVERED', () => {
    expect(transformShipment(makeTask({ state: 3 })).status).toBe('DELIVERED')
  })

  it('state 4 → EXCEPTION', () => {
    expect(transformShipment(makeTask({ state: 4 })).status).toBe('EXCEPTION')
  })

  it('state 5 → CANCELLED', () => {
    expect(transformShipment(makeTask({ state: 5 })).status).toBe('CANCELLED')
  })

  it('null state → UNKNOWN', () => {
    expect(transformShipment(makeTask({ state: null })).status).toBe('UNKNOWN')
  })

  it('carrierId is elogii', () => {
    expect(transformShipment(makeTask()).carrierId).toBe('elogii')
  })

  it('maps destination address city', () => {
    expect(transformShipment(makeTask()).destinationAddress?.city).toBe('Los Angeles')
  })

  it('maps destination address contact name', () => {
    expect(transformShipment(makeTask()).destinationAddress?.name).toBe('Jane Receiver')
  })

  it('maps origin address city', () => {
    expect(transformShipment(makeTask()).originAddress?.city).toBe('San Diego')
  })

  it('maps note to notes', () => {
    expect(transformShipment(makeTask()).notes).toBe('Fragile item')
  })

  it('maps documents[0].url to labelUrl', () => {
    expect(transformShipment(makeTask()).labelUrl).toBe('https://docs.example.com/label-001.pdf')
  })

  it('maps orderNumber to reference', () => {
    expect(transformShipment(makeTask()).reference).toBe('ORD-ELO-001')
  })

  it('parses createdAt as Date', () => {
    expect(transformShipment(makeTask()).createdAt).toBeInstanceOf(Date)
  })

  it('parses eta to estimatedDeliveryAt as Date', () => {
    expect(transformShipment(makeTask()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema validation', () => {
    const result = transformShipment(makeTask())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('metadata is the raw task', () => {
    const raw = makeTask()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})
