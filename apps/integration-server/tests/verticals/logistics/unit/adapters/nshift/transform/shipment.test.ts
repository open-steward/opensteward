import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type NShiftShipment,
  type NShiftParty,
  type NShiftParcel,
} from '../../../../../../../src/verticals/logistics/adapters/nshift/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeParty(overrides: Partial<NShiftParty> = {}): NShiftParty {
  return {
    name: 'Acme Warehouse',
    address1: '123 Industrial Way',
    address2: 'Unit B',
    zipcode: '10001',
    city: 'New York',
    country: 'US',
    contact: 'Jane Doe',
    phone: '+12125550100',
    mobile: null,
    email: 'jane@acme.example',
    ...overrides,
  }
}

function makeParcel(overrides: Partial<NShiftParcel> = {}): NShiftParcel {
  return {
    parcelNo: '1234567890',
    weight: 2.5,
    packageCode: 'PARCEL',
    copies: 1,
    contents: 'Books',
    ...overrides,
  }
}

function makeShipment(overrides: Partial<NShiftShipment> = {}): NShiftShipment {
  return {
    id: 'shp-001',
    status: 'READY',
    orderNo: 'ORD-2024-001',
    senderReference: 'MY-REF-001',
    receiverReference: null,
    shipDate: '2024-03-01T00:00:00Z',
    created: '2024-03-01T06:00:00Z',
    updated: '2024-03-01T08:00:00Z',
    service: { id: 'DHL_PARCEL' },
    sender: makeParty(),
    receiver: makeParty({
      name: 'Bob Customer',
      address1: '456 Oak Avenue',
      address2: null,
      zipcode: '90210',
      city: 'Beverly Hills',
      country: 'US',
      email: 'bob@customer.example',
    }),
    parcels: [makeParcel(), makeParcel({ parcelNo: '9876543210', weight: 1.5 })],
    pdfs: [{ href: 'https://api.nshift.com/pdfs/shp-001.pdf', description: 'Shipping label' }],
    parcelCount: 2,
    ...overrides,
  }
}

// ─── transformShipment ────────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps id and carrierId from raw shipment', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('shp-001')
    expect(result.carrierId).toBe('nshift')
  })

  it('maps serviceCode from service.id', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).serviceCode).toBe('DHL_PARCEL')
  })

  it('maps senderReference to reference', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).reference).toBe('MY-REF-001')
  })

  it('falls back to orderNo for reference when senderReference is null', () => {
    const raw = makeShipment({ senderReference: null })
    expect(transformShipment(raw).reference).toBe('ORD-2024-001')
  })

  it('maps first parcel parcelNo to trackingNumber', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).trackingNumber).toBe('1234567890')
  })

  it('maps READY status to PENDING', () => {
    const raw = makeShipment({ status: 'READY' })
    expect(transformShipment(raw).status).toBe('PENDING')
  })

  it('maps STORED status to PENDING', () => {
    const raw = makeShipment({ status: 'STORED' })
    expect(transformShipment(raw).status).toBe('PENDING')
  })

  it('maps PRINTED status to LABEL_CREATED', () => {
    const raw = makeShipment({ status: 'PRINTED' })
    expect(transformShipment(raw).status).toBe('LABEL_CREATED')
  })

  it('maps BOOKED status to LABEL_CREATED', () => {
    const raw = makeShipment({ status: 'BOOKED' })
    expect(transformShipment(raw).status).toBe('LABEL_CREATED')
  })

  it('maps DELIVERING status to IN_TRANSIT', () => {
    const raw = makeShipment({ status: 'DELIVERING' })
    expect(transformShipment(raw).status).toBe('IN_TRANSIT')
  })

  it('maps status containing TRANSIT to IN_TRANSIT', () => {
    const raw = makeShipment({ status: 'IN_TRANSIT' })
    expect(transformShipment(raw).status).toBe('IN_TRANSIT')
  })

  it('maps OUT_FOR_DELIVERY status correctly', () => {
    const raw = makeShipment({ status: 'OUT_FOR_DELIVERY' })
    expect(transformShipment(raw).status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps DELIVERED status correctly', () => {
    const raw = makeShipment({ status: 'DELIVERED' })
    expect(transformShipment(raw).status).toBe('DELIVERED')
  })

  it('maps EXCEPTION status correctly', () => {
    const raw = makeShipment({ status: 'EXCEPTION' })
    expect(transformShipment(raw).status).toBe('EXCEPTION')
  })

  it('maps status containing ERROR to EXCEPTION', () => {
    const raw = makeShipment({ status: 'BOOKING_ERROR' })
    expect(transformShipment(raw).status).toBe('EXCEPTION')
  })

  it('maps RETURNED status correctly', () => {
    const raw = makeShipment({ status: 'RETURNED' })
    expect(transformShipment(raw).status).toBe('RETURNED')
  })

  it('maps CANCELLED status correctly', () => {
    const raw = makeShipment({ status: 'CANCELLED' })
    expect(transformShipment(raw).status).toBe('CANCELLED')
  })

  it('maps DELETED to CANCELLED', () => {
    const raw = makeShipment({ status: 'DELETED' })
    expect(transformShipment(raw).status).toBe('CANCELLED')
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw = makeShipment({ status: 'SOME_UNKNOWN' })
    expect(transformShipment(raw).status).toBe('UNKNOWN')
  })

  it('sums parcel weights into totalWeight in kg', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    // 2.5 + 1.5 = 4.0 kg
    expect(result.totalWeight?.value).toBe(4.0)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps origin address from sender', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Acme Warehouse')
    expect(result.originAddress?.city).toBe('New York')
    expect(result.originAddress?.postalCode).toBe('10001')
    expect(result.originAddress?.country).toBe('US')
  })

  it('maps destination address from receiver', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.destinationAddress?.name).toBe('Bob Customer')
    expect(result.destinationAddress?.city).toBe('Beverly Hills')
    expect(result.destinationAddress?.postalCode).toBe('90210')
  })

  it('maps labelUrl from first pdf href', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).labelUrl).toBe('https://api.nshift.com/pdfs/shp-001.pdf')
  })

  it('parses created and updated as Date instances', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes raw shipment as metadata', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles null sender, receiver, parcels gracefully', () => {
    const raw = makeShipment({
      sender: null,
      receiver: null,
      parcels: null,
      pdfs: null,
      service: null,
    })
    const result = transformShipment(raw)

    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.totalWeight).toBeUndefined()
    expect(result.trackingNumber).toBeUndefined()
    expect(result.labelUrl).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
