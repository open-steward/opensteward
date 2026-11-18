import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  transformSendleAddress,
  type SendleOrder,
  type SendleParty,
} from '../../../../../src/verticals/logistics/adapters/sendle/transform/shipment'
import { transformTracking, type SendleTracking } from '../../../../../src/verticals/logistics/adapters/sendle/transform/tracking'
import { transformRate, type SendleProduct } from '../../../../../src/verticals/logistics/adapters/sendle/transform/rate'
import { transformLabel, transformLabels } from '../../../../../src/verticals/logistics/adapters/sendle/transform/label'
import type { SendleLabelEntry } from '../../../../../src/verticals/logistics/adapters/sendle/transform/shipment'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeParty(overrides: Partial<SendleParty> = {}): SendleParty {
  return {
    contact: {
      name: 'Jane Doe',
      phone: '0412345678',
      email: 'jane@example.com',
      company: 'Acme Corp',
    },
    address: {
      address_line1: '123 Main St',
      address_line2: 'Suite 4',
      suburb: 'Sydney',
      state_name: 'NSW',
      postcode: '2000',
      country: 'AU',
    },
    ...overrides,
  }
}

function makeOrder(overrides: Partial<SendleOrder> = {}): SendleOrder {
  return {
    order_id: 'ord-abc-123',
    state: 'Transit',
    sendle_reference: 'S3ND73',
    tracking_url: 'https://track.sendle.com/tracking?ref=S3ND73',
    order_url: 'https://api.sendle.com/api/orders/ord-abc-123',
    description: 'Test parcel',
    customer_reference: 'MY-REF-001',
    metadata: { foo: 'bar' },
    labels: [
      { format: 'pdf', size: 'a4', url: 'https://api.sendle.com/api/orders/ord-abc-123/labels/a4.pdf' },
    ],
    scheduling: {
      is_cancellable: true,
      pickup_date: '2024-02-01',
      picked_up_on: null,
      delivered_on: null,
      estimated_delivery_date_minimum: '2024-02-03',
      estimated_delivery_date_maximum: '2024-02-05',
    },
    weight: { value: '1.5', units: 'kg' },
    kilogram_weight: '1.5',
    dimensions: { length: '30', width: '20', height: '10', units: 'cm' },
    sender: makeParty(),
    receiver: makeParty({
      contact: { name: 'Bob Smith', phone: '0498765432', email: 'bob@example.com', company: null },
      address: {
        address_line1: '456 Elm St',
        address_line2: null,
        suburb: 'Melbourne',
        state_name: 'VIC',
        postcode: '3000',
        country: 'AU',
      },
    }),
    price: {
      gross: { amount: 12.95, currency: 'AUD' },
      net: { amount: 11.77, currency: 'AUD' },
      tax: { amount: 1.18, currency: 'AUD' },
    },
    route: { description: 'Sydney to Melbourne', type: 'national' },
    ...overrides,
  }
}

function makeTracking(overrides: Partial<SendleTracking> = {}): SendleTracking {
  return {
    state: 'Transit',
    tracking_events: [
      {
        event_type: 'Pickup',
        scan_time: '2024-02-01T09:00:00Z',
        description: 'Parcel picked up from sender',
        reason: null,
        origin_location: 'Sydney',
        destination_location: 'Melbourne',
      },
      {
        event_type: 'In Transit',
        scan_time: '2024-02-01T15:00:00Z',
        description: 'In transit to destination',
        reason: null,
        origin_location: null,
        destination_location: null,
      },
    ],
    origin: { country: 'AU' },
    destination: { country: 'AU' },
    ...overrides,
  }
}

function makeProduct(overrides: Partial<SendleProduct> = {}): SendleProduct {
  return {
    product: {
      code: 'SDLE-STD',
      name: 'Sendle Standard',
      first_mile_option: 'pickup',
      service: 'standard',
    },
    quote: {
      gross: { amount: 8.95, currency: 'AUD' },
      net: { amount: 8.14, currency: 'AUD' },
      tax: { amount: 0.81, currency: 'AUD' },
    },
    eta: {
      days_range: [2, 5],
      date_range: ['2024-02-03', '2024-02-06'],
    },
    route: {
      description: 'Sydney to Melbourne',
      type: 'national',
    },
    ...overrides,
  }
}

// ─── transformSendleAddress ──────────────────────────────────────────────────

describe('transformSendleAddress', () => {
  it('maps all canonical fields from contact + address', () => {
    const party = makeParty()
    const result = transformSendleAddress(party)

    expect(result?.name).toBe('Jane Doe')
    expect(result?.company).toBe('Acme Corp')
    expect(result?.phone).toBe('0412345678')
    expect(result?.email).toBe('jane@example.com')
    expect(result?.street1).toBe('123 Main St')
    expect(result?.street2).toBe('Suite 4')
    expect(result?.city).toBe('Sydney')
    expect(result?.state).toBe('NSW')
    expect(result?.postalCode).toBe('2000')
    expect(result?.country).toBe('AU')
  })

  it('maps suburb to city and state_name to state', () => {
    const party = makeParty()
    expect(transformSendleAddress(party)?.city).toBe('Sydney')
    expect(transformSendleAddress(party)?.state).toBe('NSW')
  })

  it('returns undefined for null party', () => {
    expect(transformSendleAddress(null)).toBeUndefined()
  })

  it('returns undefined for null fields', () => {
    const party = makeParty({
      contact: { name: null, phone: null, email: null, company: null },
      address: {
        address_line1: null,
        address_line2: null,
        suburb: null,
        state_name: null,
        postcode: null,
        country: null,
      },
    })
    expect(transformSendleAddress(party)).toBeUndefined()
  })
})

// ─── transformShipment ───────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeOrder()
    const result = transformShipment(raw)

    expect(result.id).toBe('ord-abc-123')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('S3ND73')
    expect(result.carrierId).toBe('sendle')
    expect(result.reference).toBe('MY-REF-001')
    expect(result.labelUrl).toContain('a4.pdf')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeOrder()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Jane Doe')
    expect(result.originAddress?.city).toBe('Sydney')
    expect(result.destinationAddress?.name).toBe('Bob Smith')
    expect(result.destinationAddress?.city).toBe('Melbourne')
    expect(result.destinationAddress?.postalCode).toBe('3000')
  })

  it('maps weight (kg) and dimensions (cm)', () => {
    const raw = makeOrder()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(1.5)
    expect(result.totalWeight?.unit).toBe('kg')
    expect(result.dimensions?.length).toBe(30)
    expect(result.dimensions?.width).toBe(20)
    expect(result.dimensions?.height).toBe(10)
    expect(result.dimensions?.unit).toBe('cm')
  })

  it('maps cost from gross price', () => {
    const raw = makeOrder()
    const result = transformShipment(raw)

    expect(result.cost?.amount).toBe(12.95)
    expect(result.cost?.currency).toBe('AUD')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeOrder()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeOrder({
      weight: null,
      dimensions: null,
      price: null,
      labels: null,
      sender: null,
      receiver: null,
      customer_reference: null,
      scheduling: null,
    })
    const result = transformShipment(raw)

    expect(result.totalWeight).toBeUndefined()
    expect(result.dimensions).toBeUndefined()
    expect(result.cost).toBeUndefined()
    expect(result.labelUrl).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.reference).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string, string][] = [
      ['Booking', 'PENDING'],
      ['Pickup', 'PENDING'],
      ['Pickup Attempted', 'PENDING'],
      ['Drop Off', 'PENDING'],
      ['Dropped Off', 'PENDING'],
      ['Transit', 'IN_TRANSIT'],
      ['Delivered', 'DELIVERED'],
      ['Cancelled', 'CANCELLED'],
      ['Expired', 'CANCELLED'],
      ['Unable to Book', 'EXCEPTION'],
      ['Lost', 'EXCEPTION'],
      ['Return to Sender', 'RETURNED'],
      ['SomethingElse', 'UNKNOWN'],
    ]
    for (const [sendleState, expected] of cases) {
      const raw = makeOrder({ state: sendleState })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })
})

// ─── transformTracking ───────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces one event per tracking_event', () => {
    const raw = makeTracking()
    const events = transformTracking(raw, 'S3ND73')
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTracking()
    const event = transformTracking(raw, 'S3ND73')[0]

    expect(event.trackingNumber).toBe('S3ND73')
    expect(event.carrierId).toBe('sendle')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Parcel picked up from sender')
    expect(event.location?.city).toBe('Sydney')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata (raw tracking) on every event', () => {
    const raw = makeTracking()
    const events = transformTracking(raw, 'S3ND73')
    events.forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits a single fallback event when tracking_events is empty', () => {
    const raw = makeTracking({ tracking_events: [] })
    const events = transformTracking(raw, 'S3ND73')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('S3ND73')
  })

  it('maps event types correctly', () => {
    const cases: [string, string][] = [
      ['Pickup', 'PRE_TRANSIT'],
      ['Drop Off', 'PRE_TRANSIT'],
      ['Dropped Off', 'PRE_TRANSIT'],
      ['In Transit', 'IN_TRANSIT'],
      ['Transit', 'IN_TRANSIT'],
      ['Out for Delivery', 'OUT_FOR_DELIVERY'],
      ['Delivered', 'DELIVERED'],
      ['Local Delivery', 'DELIVERED'],
      ['Card Left', 'AVAILABLE_FOR_PICKUP'],
      ['Left with Agent', 'AVAILABLE_FOR_PICKUP'],
      ['Unable to Deliver', 'FAILURE'],
      ['Damaged', 'FAILURE'],
      ['Delivery Attempted', 'FAILURE'],
      ['Expired', 'FAILURE'],
      ['SomethingElse', 'UNKNOWN'],
    ]
    for (const [eventType, expected] of cases) {
      const raw = makeTracking({
        tracking_events: [
          {
            event_type: eventType,
            scan_time: '2024-02-01T09:00:00Z',
            description: 'test',
            reason: null,
            origin_location: null,
            destination_location: null,
          },
        ],
      })
      expect(transformTracking(raw, 'S3ND73')[0].status).toBe(expected)
    }
  })

  it('handles null origin_location gracefully', () => {
    const raw = makeTracking({
      tracking_events: [
        {
          event_type: 'In Transit',
          scan_time: '2024-02-01T15:00:00Z',
          description: 'In transit',
          reason: null,
          origin_location: null,
          destination_location: null,
        },
      ],
    })
    const event = transformTracking(raw, 'S3ND73')[0]
    expect(event.location).toBeUndefined()
  })
})

// ─── transformRate ───────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeProduct()
    const result = transformRate(raw)

    expect(result.id).toBe('SDLE-STD')
    expect(result.carrierId).toBe('sendle')
    expect(result.serviceCode).toBe('SDLE-STD')
    expect(result.serviceName).toBe('Sendle Standard')
    expect(result.currency).toBe('AUD')
    expect(result.totalAmount).toBe(8.95)
    expect(result.transitDays).toBe(5)
    expect(result.deliveryDays).toBe(5)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeProduct()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('uses max days from days_range for transitDays', () => {
    const raw = makeProduct()
    raw.eta.days_range = [3, 7]
    expect(transformRate(raw).transitDays).toBe(7)
  })
})

// ─── transformLabel ──────────────────────────────────────────────────────────

describe('transformLabel', () => {
  it('maps canonical fields', () => {
    const order = makeOrder()
    const entry = order.labels![0]
    const result = transformLabel(entry, order)

    expect(result.id).toBe('ord-abc-123-a4-pdf')
    expect(result.shipmentId).toBe('ord-abc-123')
    expect(result.trackingNumber).toBe('S3ND73')
    expect(result.carrierId).toBe('sendle')
    expect(result.format).toBe('PDF')
    expect(result.status).toBe('CREATED')
    expect(result.url).toContain('a4.pdf')
  })

  it('passes through metadata (raw order) unmodified', () => {
    const order = makeOrder()
    const entry = order.labels![0]
    const meta = transformLabel(entry, order).metadata
    expect(meta).toEqual({ ...order, _labelEntry: entry })
  })

  it('maps PNG format', () => {
    const order = makeOrder()
    const entry: SendleLabelEntry = { format: 'png', size: 'cropped', url: 'https://example.com/label.png' }
    expect(transformLabel(entry, order).format).toBe('PNG')
  })
})

describe('transformLabels', () => {
  it('returns all label variants from an order', () => {
    const order = makeOrder({
      labels: [
        { format: 'pdf', size: 'a4', url: 'https://example.com/a4.pdf' },
        { format: 'pdf', size: 'cropped', url: 'https://example.com/cropped.pdf' },
      ],
    })
    const labels = transformLabels(order)
    expect(labels).toHaveLength(2)
    expect(labels[0].id).toBe('ord-abc-123-a4-pdf')
    expect(labels[1].id).toBe('ord-abc-123-cropped-pdf')
  })

  it('returns empty array when no labels exist', () => {
    const order = makeOrder({ labels: null })
    expect(transformLabels(order)).toEqual([])
  })

  it('returns empty array when labels array is empty', () => {
    const order = makeOrder({ labels: [] })
    expect(transformLabels(order)).toEqual([])
  })
})
