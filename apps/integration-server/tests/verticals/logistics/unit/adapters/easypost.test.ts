import { describe, it, expect } from 'vitest'
import { transformShipment, type EasyPostShipment } from '../../../../../src/verticals/logistics/adapters/easypost/transform/shipment'
import { transformRate, type EasyPostRate } from '../../../../../src/verticals/logistics/adapters/easypost/transform/rate'
import { transformLabel, type EasyPostPostageLabel } from '../../../../../src/verticals/logistics/adapters/easypost/transform/label'
import { transformTracker, type EasyPostTracker } from '../../../../../src/verticals/logistics/adapters/easypost/transform/tracking'
import { transformOrder, type EasyPostOrder } from '../../../../../src/verticals/logistics/adapters/easypost/transform/order'
import { transformAddress, type EasyPostAddress } from '../../../../../src/verticals/logistics/adapters/easypost/transform/address'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeAddress(overrides: Partial<EasyPostAddress> = {}): EasyPostAddress {
  return {
    id: 'adr_abc123',
    object: 'Address',
    mode: 'test',
    name: 'Jane Doe',
    company: 'Acme Corp',
    street1: '123 Main St',
    street2: 'Suite 4',
    city: 'San Francisco',
    state: 'CA',
    zip: '94105',
    country: 'US',
    phone: '4155551234',
    email: 'jane@acme.com',
    residential: false,
    verified: true,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    ...overrides,
  }
}

function makeRate(overrides: Partial<EasyPostRate> = {}): EasyPostRate {
  return {
    id: 'rate_abc123',
    object: 'Rate',
    mode: 'test',
    carrier: 'USPS',
    carrier_account_id: 'ca_abc123',
    service: 'Priority',
    rate: '9.25',
    currency: 'USD',
    retail_rate: '12.50',
    retail_currency: 'USD',
    list_rate: '10.00',
    list_currency: 'USD',
    delivery_days: 2,
    delivery_date: '2024-01-17T00:00:00Z',
    delivery_date_guaranteed: false,
    est_delivery_days: 2,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    ...overrides,
  }
}

function makePostageLabel(overrides: Partial<EasyPostPostageLabel> = {}): EasyPostPostageLabel {
  return {
    id: 'pl_abc123',
    object: 'PostageLabel',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    label_url: 'https://easypost-files.s3.amazonaws.com/files/postage_label/20240115/label.pdf',
    label_file_type: 'application/pdf',
    label_size: '4x6',
    label_resolution: 300,
    label_type: 'default',
    ...overrides,
  }
}

function makeShipment(overrides: Partial<EasyPostShipment> = {}): EasyPostShipment {
  return {
    id: 'shp_abc123',
    object: 'Shipment',
    reference: 'my-ref-001',
    mode: 'test',
    to_address: makeAddress({ id: 'adr_to', name: 'Bob Smith', street1: '456 Elm St', city: 'Austin', state: 'TX', zip: '78701' }),
    from_address: makeAddress({ id: 'adr_from' }),
    return_address: null,
    buyer_address: null,
    parcel: {
      id: 'prcl_abc123',
      object: 'Parcel',
      mode: 'test',
      length: 10,
      width: 6,
      height: 4,
      weight: 32,          // ounces = 2 lb
      predefined_package: null,
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T10:00:00Z',
    },
    rates: [makeRate()],
    selected_rate: makeRate(),
    postage_label: makePostageLabel(),
    tracking_code: '9400111899223397643730',
    status: 'in_transit',
    insurance: null,
    is_return: false,
    order_id: null,
    batch_id: null,
    messages: [],
    options: {},
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T12:00:00Z',
    ...overrides,
  }
}

function makeTracker(overrides: Partial<EasyPostTracker> = {}): EasyPostTracker {
  return {
    id: 'trk_abc123',
    object: 'Tracker',
    mode: 'test',
    tracking_code: '9400111899223397643730',
    status: 'in_transit',
    status_detail: 'in_transit',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T14:00:00Z',
    signed_by: null,
    weight: 32,
    est_delivery_date: '2024-01-17T00:00:00Z',
    shipment_id: 'shp_abc123',
    carrier: 'USPS',
    tracking_details: [
      {
        object: 'TrackingDetail',
        message: 'Departed post office',
        description: null,
        status: 'in_transit',
        datetime: '2024-01-15T11:00:00Z',
        source: 'USPS',
        carrier_code: null,
        tracking_location: {
          object: 'TrackingLocation',
          city: 'San Francisco',
          state: 'CA',
          country: 'US',
          zip: '94105',
        },
      },
    ],
    carrier_detail: null,
    public_url: 'https://track.easypost.com/djE6trk_abc123',
    ...overrides,
  }
}

function makeOrder(overrides: Partial<EasyPostOrder> = {}): EasyPostOrder {
  return {
    id: 'order_abc123',
    object: 'Order',
    reference: 'ORD-001',
    mode: 'test',
    to_address: makeAddress({ id: 'adr_to' }),
    from_address: makeAddress({ id: 'adr_from' }),
    return_address: null,
    buyer_address: null,
    shipments: [makeShipment()],
    rates: [makeRate()],
    messages: [],
    is_return: false,
    options: {},
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    ...overrides,
  }
}

// ─── transformAddress ─────────────────────────────────────────────────────────

describe('transformAddress', () => {
  it('maps all canonical fields', () => {
    const raw = makeAddress()
    const result = transformAddress(raw)

    expect(result.name).toBe('Jane Doe')
    expect(result.company).toBe('Acme Corp')
    expect(result.street1).toBe('123 Main St')
    expect(result.street2).toBe('Suite 4')
    expect(result.city).toBe('San Francisco')
    expect(result.state).toBe('CA')
    expect(result.postalCode).toBe('94105')
    expect(result.country).toBe('US')
    expect(result.phone).toBe('4155551234')
    expect(result.email).toBe('jane@acme.com')
  })

  it('maps zip to postalCode (not zip)', () => {
    const raw = makeAddress({ zip: '10001' })
    expect(transformAddress(raw).postalCode).toBe('10001')
  })

  it('returns undefined for null fields', () => {
    const raw = makeAddress({ street2: null, company: null, phone: null })
    const result = transformAddress(raw)
    expect(result.street2).toBeUndefined()
    expect(result.company).toBeUndefined()
    expect(result.phone).toBeUndefined()
  })
})

// ─── transformRate ────────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRate()
    const result = transformRate(raw)

    expect(result.id).toBe('rate_abc123')
    expect(result.carrierId).toBe('USPS')
    expect(result.serviceCode).toBe('Priority')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(9.25)
    expect(result.retailAmount).toBe(12.5)
    expect(result.transitDays).toBe(2)
    expect(result.deliveryDays).toBe(2)
    expect(result.isGuaranteedDelivery).toBe(false)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles null optional fields', () => {
    const raw = makeRate({ retail_rate: null, delivery_days: null, delivery_date: null })
    const result = transformRate(raw)
    expect(result.retailAmount).toBeUndefined()
    expect(result.transitDays).toBeUndefined()
    expect(result.estimatedDeliveryAt).toBeUndefined()
  })

  it('parses rate as a decimal from string', () => {
    const raw = makeRate({ rate: '14.99' })
    expect(transformRate(raw).totalAmount).toBe(14.99)
  })
})

// ─── transformLabel ───────────────────────────────────────────────────────────

describe('transformLabel', () => {
  it('maps canonical fields', () => {
    const raw = makePostageLabel()
    const result = transformLabel(raw, 'shp_abc123', '9400111899', 'USPS', 'Priority')

    expect(result.id).toBe('pl_abc123')
    expect(result.shipmentId).toBe('shp_abc123')
    expect(result.trackingNumber).toBe('9400111899')
    expect(result.carrierId).toBe('USPS')
    expect(result.serviceCode).toBe('Priority')
    expect(result.format).toBe('PDF')
    expect(result.status).toBe('CREATED')
    expect(result.url).toContain('label.pdf')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makePostageLabel()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('maps ZPL file type', () => {
    const raw = makePostageLabel({ label_file_type: 'application/zpl' })
    expect(transformLabel(raw).format).toBe('ZPL')
  })

  it('handles null url', () => {
    const raw = makePostageLabel({ label_url: null })
    expect(transformLabel(raw).url).toBeUndefined()
  })
})

// ─── transformTracker ─────────────────────────────────────────────────────────

describe('transformTracker', () => {
  it('produces one event per tracking_detail', () => {
    const raw = makeTracker()
    const events = transformTracker(raw)
    expect(events).toHaveLength(1)
  })

  it('maps tracking detail fields to canonical event', () => {
    const raw = makeTracker()
    const event = transformTracker(raw)[0]

    expect(event.trackingNumber).toBe('9400111899223397643730')
    expect(event.carrierId).toBe('USPS')
    expect(event.shipmentId).toBe('shp_abc123')
    expect(event.status).toBe('IN_TRANSIT')
    expect(event.description).toBe('Departed post office')
    expect(event.location?.city).toBe('San Francisco')
    expect(event.location?.state).toBe('CA')
    expect(event.location?.postalCode).toBe('94105')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata (raw tracker) on every event', () => {
    const raw = makeTracker()
    const events = transformTracker(raw)
    events.forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits a single summary event when tracking_details is empty', () => {
    const raw = makeTracker({ tracking_details: [] })
    const events = transformTracker(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('IN_TRANSIT')
  })

  it('maps pre_transit status correctly', () => {
    const raw = makeTracker({ status: 'pre_transit', tracking_details: [] })
    expect(transformTracker(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps return_to_sender status correctly', () => {
    const raw = makeTracker({ status: 'return_to_sender', tracking_details: [] })
    expect(transformTracker(raw)[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps failure status correctly', () => {
    const raw = makeTracker({ status: 'failure', tracking_details: [] })
    expect(transformTracker(raw)[0].status).toBe('FAILURE')
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw = makeTracker({ status: 'not_a_real_status', tracking_details: [] })
    expect(transformTracker(raw)[0].status).toBe('UNKNOWN')
  })
})

// ─── transformShipment ────────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('shp_abc123')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('9400111899223397643730')
    expect(result.carrierId).toBe('USPS')
    expect(result.serviceCode).toBe('Priority')
    expect(result.reference).toBe('my-ref-001')
    expect(result.labelUrl).toContain('label.pdf')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Jane Doe')
    expect(result.destinationAddress?.name).toBe('Bob Smith')
    expect(result.destinationAddress?.city).toBe('Austin')
    expect(result.destinationAddress?.postalCode).toBe('78701')
  })

  it('maps parcel weight (oz) and dimensions', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(32)
    expect(result.totalWeight?.unit).toBe('oz')
    expect(result.dimensions?.length).toBe(10)
    expect(result.dimensions?.width).toBe(6)
    expect(result.dimensions?.height).toBe(4)
    expect(result.dimensions?.unit).toBe('in')
  })

  it('maps cost from selected_rate', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.cost?.amount).toBe(9.25)
    expect(result.cost?.currency).toBe('USD')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipment({
      selected_rate: null,
      postage_label: null,
      parcel: null,
      tracking_code: null,
      return_address: null,
    })
    const result = transformShipment(raw)

    expect(result.carrierId).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.labelUrl).toBeUndefined()
    expect(result.totalWeight).toBeUndefined()
    expect(result.dimensions).toBeUndefined()
    expect(result.trackingNumber).toBeUndefined()
    expect(result.returnAddress).toBeUndefined()
    expect(result.cost).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string, string][] = [
      ['pre_transit', 'LABEL_CREATED'],
      ['in_transit', 'IN_TRANSIT'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['available_for_pickup', 'OUT_FOR_DELIVERY'],
      ['return_to_sender', 'RETURNED'],
      ['cancelled', 'CANCELLED'],
      ['failure', 'EXCEPTION'],
      ['error', 'EXCEPTION'],
      ['unknown', 'UNKNOWN'],
    ]
    for (const [epStatus, expected] of cases) {
      const raw = makeShipment({ status: epStatus })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })
})

// ─── transformOrder ───────────────────────────────────────────────────────────

describe('transformOrder', () => {
  it('maps canonical fields', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)

    expect(result.id).toBe('order_abc123')
    expect(result.orderNumber).toBe('ORD-001')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps shipment IDs from nested shipments', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.shipmentIds).toEqual(['shp_abc123'])
  })

  it('maps addresses', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.originAddress?.name).toBe('Jane Doe')
    expect(result.destinationAddress?.name).toBe('Jane Doe')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('handles missing reference gracefully', () => {
    const raw = makeOrder({ reference: null })
    expect(transformOrder(raw).orderNumber).toBeUndefined()
  })

  it('returns undefined shipmentIds when shipments array is empty', () => {
    const raw = makeOrder({ shipments: [] })
    expect(transformOrder(raw).shipmentIds).toBeUndefined()
  })
})
