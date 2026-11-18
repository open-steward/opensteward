import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type Parcel2GoShipment,
} from '../../../../../../../src/verticals/logistics/adapters/parcel2go/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeShipment(overrides: Partial<Parcel2GoShipment> = {}): Parcel2GoShipment {
  return {
    OrderLineId: 'OL-SHP-001',
    OrderId: 'ORD-SHP-001',
    TrackingNumber: 'TRK001',
    Status: 'in_transit',
    CourierName: 'Evri',
    Slug: 'evri-parcelshop',
    TotalPrice: 4.99,
    CollectionAddress: {
      Name: 'Sender',
      Street: '1 Pick St',
      Town: 'Birmingham',
      Postcode: 'B1 1AA',
      Country: 'GB',
    },
    DeliveryAddress: {
      Name: 'Receiver',
      Street: '2 Drop Rd',
      Town: 'Coventry',
      Postcode: 'CV1 1BB',
      Country: 'GB',
    },
    Weight: 1.5,
    Length: 30,
    Width: 20,
    Height: 10,
    LabelUrl: 'https://labels.parcel2go.example/OL-SHP-001.pdf',
    EstimatedDeliveryDate: '2024-03-04T00:00:00Z',
    CreatedAt: '2024-03-01T00:00:00Z',
    UpdatedAt: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parcel2go transformShipment', () => {
  it('maps id from OrderLineId', () => {
    expect(transformShipment(makeShipment()).id).toBe('OL-SHP-001')
  })

  it('falls back id to OrderId when OrderLineId is null', () => {
    expect(transformShipment(makeShipment({ OrderLineId: null })).id).toBe('ORD-SHP-001')
  })

  it('maps trackingNumber from TrackingNumber', () => {
    expect(transformShipment(makeShipment()).trackingNumber).toBe('TRK001')
  })

  it('maps carrierId from CourierName', () => {
    expect(transformShipment(makeShipment()).carrierId).toBe('Evri')
  })

  it('maps serviceCode from Slug', () => {
    expect(transformShipment(makeShipment()).serviceCode).toBe('evri-parcelshop')
  })

  it('maps IN_TRANSIT status via lowercase includes', () => {
    expect(transformShipment(makeShipment({ Status: 'in_transit' })).status).toBe('IN_TRANSIT')
  })

  it('maps delivered status', () => {
    expect(transformShipment(makeShipment({ Status: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps out for delivery status', () => {
    expect(transformShipment(makeShipment({ Status: 'out_for_delivery' })).status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps label_created status', () => {
    expect(transformShipment(makeShipment({ Status: 'label created' })).status).toBe(
      'LABEL_CREATED',
    )
  })

  it('maps return status', () => {
    expect(transformShipment(makeShipment({ Status: 'return' })).status).toBe('RETURNED')
  })

  it('maps cancel status', () => {
    expect(transformShipment(makeShipment({ Status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to UNKNOWN', () => {
    expect(transformShipment(makeShipment({ Status: null })).status).toBe('UNKNOWN')
  })

  it('maps origin address name from CollectionAddress', () => {
    expect(transformShipment(makeShipment()).originAddress?.name).toBe('Sender')
  })

  it('maps destination address name from DeliveryAddress', () => {
    expect(transformShipment(makeShipment()).destinationAddress?.name).toBe('Receiver')
  })

  it('maps totalWeight from Weight in kg', () => {
    const r = transformShipment(makeShipment())
    expect(r.totalWeight?.value).toBe(1.5)
    expect(r.totalWeight?.unit).toBe('kg')
  })

  it('maps dimensions from Length/Width/Height', () => {
    const r = transformShipment(makeShipment())
    expect(r.dimensions?.length).toBe(30)
    expect(r.dimensions?.width).toBe(20)
    expect(r.dimensions?.height).toBe(10)
    expect(r.dimensions?.unit).toBe('cm')
  })

  it('omits dimensions when any dimension is null', () => {
    expect(transformShipment(makeShipment({ Height: null })).dimensions).toBeUndefined()
  })

  it('maps labelUrl from LabelUrl', () => {
    expect(transformShipment(makeShipment()).labelUrl).toBe(
      'https://labels.parcel2go.example/OL-SHP-001.pdf',
    )
  })

  it('maps cost from TotalPrice in GBP', () => {
    const r = transformShipment(makeShipment())
    expect(r.cost?.amount).toBe(4.99)
    expect(r.cost?.currency).toBe('GBP')
  })

  it('parses EstimatedDeliveryDate as Date', () => {
    expect(transformShipment(makeShipment()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('parses CreatedAt as Date', () => {
    expect(transformShipment(makeShipment()).createdAt).toBeInstanceOf(Date)
  })

  it('sets mode to parcel', () => {
    expect(transformShipment(makeShipment()).mode).toBe('parcel')
  })

  it('passes metadata as raw object', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('throws on ShipmentSchema validation because transformShipment emits a float cost.amount but MoneySchema.amount uses Amount (integer minor-units)', () => {
    // Source bug: parcel2go passes TotalPrice as a float (e.g. 4.99 GBP) to cost.amount,
    // but MoneySchema.amount (Amount) requires a safe integer (minor-unit pence).
    expect(() => ShipmentSchema.parse(transformShipment(makeShipment()))).toThrow()
  })
})
