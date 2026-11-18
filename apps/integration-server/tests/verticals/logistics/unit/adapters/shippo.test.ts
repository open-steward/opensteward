import { describe, it, expect } from 'vitest'
import { transformAddress, type ShippoAddress } from '../../../../../src/verticals/logistics/adapters/shippo/transform/address'
import { transformRate, type ShippoRate } from '../../../../../src/verticals/logistics/adapters/shippo/transform/rate'
import { transformLabel, type ShippoTransaction } from '../../../../../src/verticals/logistics/adapters/shippo/transform/label'
import { transformTracker, type ShippoTrack, type ShippoTrackingStatus } from '../../../../../src/verticals/logistics/adapters/shippo/transform/tracking'
import { transformShipment, type ShippoShipment, type ShippoParcel } from '../../../../../src/verticals/logistics/adapters/shippo/transform/shipment'
import { transformCarrier, type ShippoCarrierAccount } from '../../../../../src/verticals/logistics/adapters/shippo/transform/carrier'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeAddress(overrides: Partial<ShippoAddress> = {}): ShippoAddress {
  return {
    object_id: 'addr_abc123',
    object_created: '2024-01-15T10:00:00Z',
    object_updated: '2024-01-15T10:00:00Z',
    object_owner: 'user@example.com',
    name: 'Jane Doe',
    company: 'Acme Corp',
    street1: '123 Main St',
    street2: 'Suite 4',
    street3: null,
    street_no: null,
    city: 'San Francisco',
    state: 'CA',
    zip: '94105',
    country: 'US',
    phone: '4155551234',
    email: 'jane@acme.com',
    is_residential: false,
    is_complete: true,
    metadata: null,
    test: false,
    ...overrides,
  }
}

function makeParcel(overrides: Partial<ShippoParcel> = {}): ShippoParcel {
  return {
    object_id: 'parcel_abc123',
    object_created: '2024-01-15T10:00:00Z',
    object_updated: '2024-01-15T10:00:00Z',
    object_owner: 'user@example.com',
    object_state: 'VALID',
    length: '10',
    width: '8',
    height: '4',
    distance_unit: 'in',
    weight: '16',
    mass_unit: 'oz',
    template: null,
    metadata: null,
    test: false,
    ...overrides,
  }
}

function makeRate(overrides: Partial<ShippoRate> = {}): ShippoRate {
  return {
    object_id: 'rate_abc123',
    object_created: '2024-01-15T10:00:00Z',
    object_updated: '2024-01-15T10:00:00Z',
    object_owner: 'user@example.com',
    amount: '9.25',
    currency: 'USD',
    amount_local: '9.25',
    currency_local: 'USD',
    provider: 'USPS',
    servicelevel: {
      name: 'Priority Mail',
      token: 'usps_priority',
      terms: null,
      extended_token: null,
      parent_servicelevel: null,
    },
    carrier_account: 'ca_abc123',
    shipment: 'shp_abc123',
    estimated_days: 2,
    arrives_by: '2024-01-17T00:00:00Z',
    duration_terms: null,
    attributes: ['BESTVALUE'],
    messages: null,
    test: false,
    ...overrides,
  }
}

function makeShipment(overrides: Partial<ShippoShipment> = {}): ShippoShipment {
  return {
    object_id: 'shp_abc123',
    object_created: '2024-01-15T10:00:00Z',
    object_updated: '2024-01-15T10:00:00Z',
    object_owner: 'user@example.com',
    status: 'SUCCESS',
    address_from: makeAddress({ object_id: 'addr_from' }),
    address_to: makeAddress({ object_id: 'addr_to', name: 'John Smith' }),
    address_return: null,
    parcels: [makeParcel()],
    shipment_date: null,
    carrier_accounts: [],
    metadata: 'order-ref-123',
    rates: [makeRate()],
    messages: [],
    test: false,
    extra: null,
    ...overrides,
  }
}

function makeTrackingStatus(overrides: Partial<ShippoTrackingStatus> = {}): ShippoTrackingStatus {
  return {
    object_id: 'ts_abc123',
    object_created: '2024-01-16T14:00:00Z',
    object_updated: '2024-01-16T14:00:00Z',
    status: 'TRANSIT',
    status_details: 'Your shipment has departed the origin facility.',
    status_date: '2024-01-16T12:00:00Z',
    substatus: null,
    location: {
      city: 'San Francisco',
      state: 'CA',
      zip: '94105',
      country: 'US',
    },
    ...overrides,
  }
}

function makeTrack(overrides: Partial<ShippoTrack> = {}): ShippoTrack {
  return {
    carrier: 'usps',
    tracking_number: '9205590164917312751089',
    address_from: { city: 'San Francisco', state: 'CA', zip: '94105', country: 'US' },
    address_to: { city: 'New York', state: 'NY', zip: '10001', country: 'US' },
    eta: '2024-01-18T00:00:00Z',
    original_eta: '2024-01-18T00:00:00Z',
    servicelevel: { name: 'Priority Mail', token: 'usps_priority' },
    tracking_status: makeTrackingStatus({ status: 'DELIVERED', status_details: 'Delivered' }),
    tracking_history: [
      makeTrackingStatus({ status: 'PRE_TRANSIT', status_details: 'Label created', status_date: '2024-01-15T10:00:00Z' }),
      makeTrackingStatus({ status: 'TRANSIT', status_details: 'In transit', status_date: '2024-01-16T12:00:00Z' }),
      makeTrackingStatus({ status: 'DELIVERED', status_details: 'Delivered', status_date: '2024-01-17T14:00:00Z' }),
    ],
    transaction: 'txn_abc123',
    messages: [],
    metadata: null,
    test: false,
    ...overrides,
  }
}

function makeTransaction(overrides: Partial<ShippoTransaction> = {}): ShippoTransaction {
  return {
    object_id: 'txn_abc123',
    object_created: '2024-01-15T10:00:00Z',
    object_updated: '2024-01-15T10:00:00Z',
    object_owner: 'user@example.com',
    object_state: 'VALID',
    status: 'SUCCESS',
    rate: makeRate(),
    tracking_number: '9205590164917312751089',
    tracking_status: 'TRANSIT',
    tracking_url_provider: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=9205590164917312751089',
    label_url: 'https://shippo-delivery.s3.amazonaws.com/label.pdf',
    commercial_invoice_url: null,
    label_file_type: 'PDF',
    parcel: 'parcel_abc123',
    metadata: null,
    messages: null,
    test: false,
    ...overrides,
  }
}

function makeCarrierAccount(overrides: Partial<ShippoCarrierAccount> = {}): ShippoCarrierAccount {
  return {
    object_id: 'ca_abc123',
    object_owner: 'user@example.com',
    carrier: 'usps',
    carrier_name: 'USPS',
    account_id: '****1234',
    parameters: null,
    active: true,
    is_shippo_account: true,
    metadata: null,
    service_levels: [
      { name: 'Priority Mail', token: 'usps_priority', supports_return_labels: true },
      { name: 'First-Class Mail', token: 'usps_first', supports_return_labels: false },
    ],
    test: false,
    ...overrides,
  }
}

// ─── Address ──────────────────────────────────────────────────────────────────

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

  it('handles null optional fields', () => {
    const raw = makeAddress({ name: null, company: null, street2: null, phone: null, email: null })
    const result = transformAddress(raw)
    expect(result.name).toBeUndefined()
    expect(result.company).toBeUndefined()
    expect(result.street2).toBeUndefined()
    expect(result.phone).toBeUndefined()
    expect(result.email).toBeUndefined()
  })
})

// ─── Rate ─────────────────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps all canonical fields', () => {
    const raw = makeRate()
    const result = transformRate(raw)

    expect(result.id).toBe('rate_abc123')
    expect(result.carrierId).toBe('USPS')
    expect(result.serviceCode).toBe('usps_priority')
    expect(result.serviceName).toBe('Priority Mail')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(9.25)
    expect(result.transitDays).toBe(2)
    expect(result.deliveryDays).toBe(2)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.isGuaranteedDelivery).toBe(true)
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles null optional fields', () => {
    const raw = makeRate({ estimated_days: null, arrives_by: null })
    const result = transformRate(raw)
    expect(result.transitDays).toBeUndefined()
    expect(result.deliveryDays).toBeUndefined()
    expect(result.estimatedDeliveryAt).toBeUndefined()
    expect(result.isGuaranteedDelivery).toBeUndefined()
  })

  it('parses rate as a decimal from string', () => {
    const raw = makeRate({ amount: '14.99' })
    expect(transformRate(raw).totalAmount).toBe(14.99)
  })
})

// ─── Shipment ─────────────────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps all canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('shp_abc123')
    expect(result.status).toBe('PENDING')
    expect(result.originAddress).toBeDefined()
    expect(result.destinationAddress).toBeDefined()
    expect(result.totalWeight).toEqual({ value: 16, unit: 'oz' })
    expect(result.dimensions).toEqual({ length: 10, width: 8, height: 4, unit: 'in' })
    expect(result.reference).toBe('order-ref-123')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles null optional fields', () => {
    const raw = makeShipment({ address_from: null, address_to: null, parcels: [], metadata: '' })
    const result = transformShipment(raw)
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.totalWeight).toBeUndefined()
    expect(result.dimensions).toBeUndefined()
    expect(result.reference).toBeUndefined()
  })

  it('maps shipment status values', () => {
    const cases: [string, string][] = [
      ['SUCCESS', 'PENDING'],
      ['WAITING', 'PENDING'],
      ['QUEUED', 'PENDING'],
      ['ERROR', 'EXCEPTION'],
      ['anything_else', 'UNKNOWN'],
    ]
    for (const [input, expected] of cases) {
      const result = transformShipment(makeShipment({ status: input }))
      expect(result.status).toBe(expected)
    }
  })

  it('handles metric parcels', () => {
    const raw = makeShipment({
      parcels: [makeParcel({ distance_unit: 'cm', mass_unit: 'kg', weight: '2.5', length: '25', width: '20', height: '10' })],
    })
    const result = transformShipment(raw)
    expect(result.totalWeight).toEqual({ value: 2.5, unit: 'kg' })
    expect(result.dimensions).toEqual({ length: 25, width: 20, height: 10, unit: 'cm' })
  })
})

// ─── Label (Transaction) ─────────────────────────────────────────────────────

describe('transformLabel', () => {
  it('maps all canonical fields', () => {
    const raw = makeTransaction()
    const result = transformLabel(raw)

    expect(result.id).toBe('txn_abc123')
    expect(result.trackingNumber).toBe('9205590164917312751089')
    expect(result.carrierId).toBe('USPS')
    expect(result.serviceCode).toBe('usps_priority')
    expect(result.format).toBe('PDF')
    expect(result.status).toBe('CREATED')
    expect(result.url).toBe('https://shippo-delivery.s3.amazonaws.com/label.pdf')
    expect(result.cost).toEqual({ amount: 9.25, currency: 'USD' })
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTransaction()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('handles null optional fields', () => {
    const raw = makeTransaction({
      tracking_number: null,
      label_url: null,
      label_file_type: null,
      rate: 'rate_abc123',
    })
    const result = transformLabel(raw)
    expect(result.trackingNumber).toBeUndefined()
    expect(result.url).toBeUndefined()
    expect(result.format).toBeUndefined()
    expect(result.carrierId).toBeUndefined()
    expect(result.cost).toBeUndefined()
  })

  it('maps label status values', () => {
    const cases: [string, string][] = [
      ['SUCCESS', 'CREATED'],
      ['REFUNDED', 'REFUNDED'],
      ['REFUNDPENDING', 'CREATED'],
      ['REFUNDREJECTED', 'CREATED'],
      ['ERROR', 'VOIDED'],
    ]
    for (const [input, expected] of cases) {
      const result = transformLabel(makeTransaction({ status: input }))
      expect(result.status).toBe(expected)
    }
  })

  it('maps label file types', () => {
    const cases: [string, string][] = [
      ['PDF', 'PDF'],
      ['PDF_4x6', 'PDF'],
      ['PNG', 'PNG'],
      ['PNG_2.3x7.5', 'PNG'],
      ['ZPLII', 'ZPL'],
    ]
    for (const [input, expected] of cases) {
      const result = transformLabel(makeTransaction({ label_file_type: input }))
      expect(result.format).toBe(expected)
    }
  })
})

// ─── Tracking ─────────────────────────────────────────────────────────────────

describe('transformTracker', () => {
  it('maps tracking history to events', () => {
    const raw = makeTrack()
    const events = transformTracker(raw)

    expect(events).toHaveLength(3)
    expect(events[0].status).toBe('PRE_TRANSIT')
    expect(events[1].status).toBe('IN_TRANSIT')
    expect(events[2].status).toBe('DELIVERED')
  })

  it('includes tracking number and carrier on each event', () => {
    const raw = makeTrack()
    const events = transformTracker(raw)

    for (const event of events) {
      expect(event.trackingNumber).toBe('9205590164917312751089')
      expect(event.carrierId).toBe('usps')
    }
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTrack()
    const events = transformTracker(raw)
    for (const event of events) {
      expect(event.metadata).toBe(raw)
    }
  })

  it('falls back to tracking_status when history is empty', () => {
    const raw = makeTrack({
      tracking_history: [],
      tracking_status: makeTrackingStatus({ status: 'DELIVERED', status_details: 'Delivered' }),
    })
    const events = transformTracker(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('DELIVERED')
    expect(events[0].description).toBe('Delivered')
  })

  it('maps tracking status values', () => {
    const cases: [string, string][] = [
      ['PRE_TRANSIT', 'PRE_TRANSIT'],
      ['TRANSIT', 'IN_TRANSIT'],
      ['DELIVERED', 'DELIVERED'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['FAILURE', 'FAILURE'],
      ['UNKNOWN', 'UNKNOWN'],
    ]
    for (const [input, expected] of cases) {
      const events = transformTracker(makeTrack({
        tracking_history: [makeTrackingStatus({ status: input })],
      }))
      expect(events[0].status).toBe(expected)
    }
  })

  it('maps tracking location to address', () => {
    const raw = makeTrack()
    const events = transformTracker(raw)
    expect(events[0].location).toEqual({
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94105',
      country: 'US',
    })
  })

  it('handles null location', () => {
    const raw = makeTrack({
      tracking_history: [makeTrackingStatus({ location: null })],
    })
    const events = transformTracker(raw)
    expect(events[0].location).toBeUndefined()
  })
})

// ─── Carrier ──────────────────────────────────────────────────────────────────

describe('transformCarrier', () => {
  it('maps all canonical fields', () => {
    const raw = makeCarrierAccount()
    const result = transformCarrier(raw)

    expect(result.id).toBe('ca_abc123')
    expect(result.name).toBe('USPS')
    expect(result.code).toBe('usps')
    expect(result.isActive).toBe(true)
    expect(result.services).toHaveLength(2)
    expect(result.services![0].code).toBe('usps_priority')
    expect(result.services![0].name).toBe('Priority Mail')
    expect(result.services![1].code).toBe('usps_first')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeCarrierAccount()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })

  it('handles null optional fields', () => {
    const raw = makeCarrierAccount({ carrier_name: null, active: null, service_levels: null })
    const result = transformCarrier(raw)
    expect(result.name).toBe('usps')
    expect(result.isActive).toBeUndefined()
    expect(result.services).toBeUndefined()
  })
})
