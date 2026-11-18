import { describe, it, expect } from 'vitest'
import { transformOrder, type ShipBobOrder } from '../../../../../src/verticals/logistics/adapters/shipbob/transform/order'
import { transformShipment, type ShipBobShipment } from '../../../../../src/verticals/logistics/adapters/shipbob/transform/shipment'
import { transformWarehouse, type ShipBobFulfillmentCenter } from '../../../../../src/verticals/logistics/adapters/shipbob/transform/warehouse'
import { transformTracking } from '../../../../../src/verticals/logistics/adapters/shipbob/transform/tracking'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<ShipBobOrder> = {}): ShipBobOrder {
  return {
    id: 12345,
    reference_id: 'EXT-001',
    order_number: 'ORD-001',
    status: 'Processing',
    created_date: '2024-06-01T10:00:00Z',
    purchase_date: '2024-05-31T18:00:00Z',
    channel: { id: 100, name: 'My Store' },
    recipient: {
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone_number: '5551234567',
      address: {
        address1: '123 Main St',
        address2: 'Apt 4B',
        city: 'Chicago',
        state: 'IL',
        zip_code: '60601',
        country: 'US',
        company_name: 'Acme Corp',
      },
    },
    products: [
      {
        id: 501,
        reference_id: 'SKU-A',
        name: 'Widget',
        sku: 'SKU-A',
        quantity: 2,
        unit_price: 19.99,
        external_line_id: 'line-1',
        gtin: null,
        upc: null,
      },
    ],
    shipments: [
      { id: 9001, tracking_number: '1Z999AA10123456784', status: 'Completed' },
    ],
    financials: { total_price: 45.98 },
    shipping_method: 'Standard',
    gift_message: null,
    tags: null,
    type: 'DTC',
    ...overrides,
  }
}

function makeShipment(overrides: Partial<ShipBobShipment> = {}): ShipBobShipment {
  return {
    id: 9001,
    order_id: 12345,
    reference_id: 'EXT-001',
    status: 'Completed',
    created_date: '2024-06-01T12:00:00Z',
    last_update_at: '2024-06-03T08:00:00Z',
    estimated_fulfillment_date: '2024-06-02T00:00:00Z',
    actual_fulfillment_date: '2024-06-02T14:00:00Z',
    delivery_date: '2024-06-03T08:00:00Z',
    tracking_number: '1Z999AA10123456784',
    tracking_url: 'https://tracking.shipbob.com/1Z999AA10123456784',
    carrier: 'UPS',
    carrier_service: 'Ground',
    ship_option: 'Standard',
    invoice_amount: 8.50,
    invoice_currency_code: 'USD',
    measurements: {
      total_weight_oz: 24,
      length_in: 12,
      width_in: 8,
      depth_in: 6,
    },
    recipient: {
      name: 'Jane',
      full_name: 'Jane Doe',
      email: 'jane@example.com',
      phone_number: '5551234567',
      address1: '123 Main St',
      address2: 'Apt 4B',
      city: 'Chicago',
      state: 'IL',
      zip_code: '60601',
      country: 'US',
      company_name: 'Acme Corp',
    },
    location: { id: 42, name: 'Cicero FC' },
    products: [
      { id: 501, name: 'Widget', sku: 'SKU-A', reference_id: 'SKU-A' },
    ],
    status_details: [],
    gift_message: 'Happy birthday!',
    require_signature: false,
    insurance_value: null,
    is_tracking_uploaded: true,
    ...overrides,
  }
}

function makeWarehouse(overrides: Partial<ShipBobFulfillmentCenter> = {}): ShipBobFulfillmentCenter {
  return {
    id: 42,
    name: 'Cicero FC',
    address1: '4455 W 62nd St',
    address2: null,
    city: 'Chicago',
    state: 'IL',
    zip_code: '60638',
    country: 'US',
    timezone: 'America/Chicago',
    phone_number: '3125551234',
    email: 'cicero@shipbob.com',
    ...overrides,
  }
}

// ─── transformOrder ──────────────────────────────────────────────────────────

describe('transformOrder', () => {
  it('maps all canonical fields', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)

    expect(result.id).toBe('12345')
    expect(result.status).toBe('PROCESSING')
    expect(result.orderNumber).toBe('ORD-001')
    expect(result.totalAmount).toBe(45.98)
    expect(result.requestedServiceCode).toBe('Standard')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.orderAt).toBeInstanceOf(Date)
  })

  it('maps destination address from recipient', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)

    expect(result.destinationAddress?.name).toBe('Jane Doe')
    expect(result.destinationAddress?.company).toBe('Acme Corp')
    expect(result.destinationAddress?.street1).toBe('123 Main St')
    expect(result.destinationAddress?.street2).toBe('Apt 4B')
    expect(result.destinationAddress?.city).toBe('Chicago')
    expect(result.destinationAddress?.state).toBe('IL')
    expect(result.destinationAddress?.postalCode).toBe('60601')
    expect(result.destinationAddress?.country).toBe('US')
    expect(result.destinationAddress?.phone).toBe('5551234567')
    expect(result.destinationAddress?.email).toBe('jane@example.com')
  })

  it('maps shipment IDs from nested shipments', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.shipmentIds).toEqual(['9001'])
  })

  it('maps line items from products', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].sku).toBe('SKU-A')
    expect(result.lineItems![0].name).toBe('Widget')
    expect(result.lineItems![0].quantity).toBe(2)
    expect(result.lineItems![0].unitAmount).toBe(19.99)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('falls back to reference_id when order_number is null', () => {
    const raw = makeOrder({ order_number: null })
    expect(transformOrder(raw).orderNumber).toBe('EXT-001')
  })

  it('returns undefined shipmentIds when shipments array is empty', () => {
    const raw = makeOrder({ shipments: [] })
    expect(transformOrder(raw).shipmentIds).toBeUndefined()
  })

  it('handles null recipient gracefully', () => {
    const raw = makeOrder({ recipient: null })
    expect(transformOrder(raw).destinationAddress).toBeUndefined()
  })

  it('handles null products gracefully', () => {
    const raw = makeOrder({ products: null })
    expect(transformOrder(raw).lineItems).toBeUndefined()
  })

  it('maps all order statuses correctly', () => {
    const cases: [string, string][] = [
      ['Processing', 'PROCESSING'],
      ['Exception', 'ON_HOLD'],
      ['OnHold', 'ON_HOLD'],
      ['On Hold', 'ON_HOLD'],
      ['PartiallyFulfilled', 'SHIPPED'],
      ['Partially Fulfilled', 'SHIPPED'],
      ['Completed', 'DELIVERED'],
      ['Fulfilled', 'DELIVERED'],
      ['Cancelled', 'CANCELLED'],
      ['ImportReview', 'PENDING'],
    ]
    for (const [sbStatus, expected] of cases) {
      const raw = makeOrder({ status: sbStatus })
      expect(transformOrder(raw).status).toBe(expected)
    }
  })

  it('maps unknown status to PENDING', () => {
    const raw = makeOrder({ status: 'SomethingNew' })
    expect(transformOrder(raw).status).toBe('PENDING')
  })

  it('maps null status to PENDING', () => {
    const raw = makeOrder({ status: null })
    expect(transformOrder(raw).status).toBe('PENDING')
  })
})

// ─── transformShipment ───────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('9001')
    expect(result.status).toBe('DELIVERED')
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.carrierId).toBe('UPS')
    expect(result.serviceCode).toBe('Ground')
    expect(result.warehouseId).toBe('42')
    expect(result.reference).toBe('EXT-001')
    expect(result.notes).toBe('Happy birthday!')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps destination address from recipient', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.destinationAddress?.name).toBe('Jane Doe')
    expect(result.destinationAddress?.company).toBe('Acme Corp')
    expect(result.destinationAddress?.street1).toBe('123 Main St')
    expect(result.destinationAddress?.city).toBe('Chicago')
    expect(result.destinationAddress?.postalCode).toBe('60601')
  })

  it('maps weight and dimensions from measurements', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(24)
    expect(result.totalWeight?.unit).toBe('oz')
    expect(result.dimensions?.length).toBe(12)
    expect(result.dimensions?.width).toBe(8)
    expect(result.dimensions?.height).toBe(6)
    expect(result.dimensions?.unit).toBe('in')
  })

  it('maps cost from invoice fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.cost?.amount).toBe(8.5)
    expect(result.cost?.currency).toBe('USD')
  })

  it('maps delivery dates', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.actualDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipment({
      tracking_number: null,
      carrier: null,
      carrier_service: null,
      ship_option: null,
      measurements: null,
      recipient: null,
      location: null,
      invoice_amount: null,
      gift_message: null,
      reference_id: null,
    })
    const result = transformShipment(raw)

    expect(result.trackingNumber).toBeUndefined()
    expect(result.carrierId).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.warehouseId).toBeUndefined()
    expect(result.totalWeight).toBeUndefined()
    expect(result.dimensions).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.cost).toBeUndefined()
    expect(result.notes).toBeUndefined()
    expect(result.reference).toBeUndefined()
  })

  it('prefers full_name over name in recipient', () => {
    const raw = makeShipment()
    raw.recipient!.full_name = 'Full Name'
    raw.recipient!.name = 'Short'
    expect(transformShipment(raw).destinationAddress?.name).toBe('Full Name')
  })

  it('falls back to ship_option when carrier_service is null', () => {
    const raw = makeShipment({ carrier_service: null })
    expect(transformShipment(raw).serviceCode).toBe('Standard')
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string, string][] = [
      ['Processing', 'IN_TRANSIT'],
      ['Completed', 'DELIVERED'],
      ['Cancelled', 'CANCELLED'],
      ['Exception', 'EXCEPTION'],
      ['OnHold', 'PENDING'],
      ['On Hold', 'PENDING'],
      ['LabeledCreated', 'LABEL_CREATED'],
      ['LabelCreated', 'LABEL_CREATED'],
      ['CleanSweeped', 'CANCELLED'],
      ['ImportReview', 'PENDING'],
      ['None', 'PENDING'],
    ]
    for (const [sbStatus, expected] of cases) {
      const raw = makeShipment({ status: sbStatus })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw = makeShipment({ status: 'FutureStatus' })
    expect(transformShipment(raw).status).toBe('UNKNOWN')
  })
})

// ─── transformWarehouse ──────────────────────────────────────────────────────

describe('transformWarehouse', () => {
  it('maps canonical fields', () => {
    const raw = makeWarehouse()
    const result = transformWarehouse(raw)

    expect(result.id).toBe('42')
    expect(result.name).toBe('Cicero FC')
    expect(result.isActive).toBe(true)
    expect(result.timezone).toBe('America/Chicago')
  })

  it('maps address fields', () => {
    const raw = makeWarehouse()
    const result = transformWarehouse(raw)

    expect(result.address?.street1).toBe('4455 W 62nd St')
    expect(result.address?.city).toBe('Chicago')
    expect(result.address?.state).toBe('IL')
    expect(result.address?.postalCode).toBe('60638')
    expect(result.address?.country).toBe('US')
    expect(result.address?.phone).toBe('3125551234')
    expect(result.address?.email).toBe('cicero@shipbob.com')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeWarehouse()
    expect(transformWarehouse(raw).metadata).toBe(raw)
  })

  it('returns undefined address when all address fields are null', () => {
    const raw = makeWarehouse({
      address1: null,
      address2: null,
      city: null,
      state: null,
      zip_code: null,
      country: null,
    })
    expect(transformWarehouse(raw).address).toBeUndefined()
  })

  it('handles null name gracefully', () => {
    const raw = makeWarehouse({ name: null })
    expect(transformWarehouse(raw).name).toBeUndefined()
  })

  it('handles null timezone gracefully', () => {
    const raw = makeWarehouse({ timezone: null })
    expect(transformWarehouse(raw).timezone).toBeUndefined()
  })
})

// ─── transformTracking ───────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces one tracking event per shipment', () => {
    const raw = makeShipment()
    const events = transformTracking(raw)
    expect(events).toHaveLength(1)
  })

  it('maps tracking fields to canonical event', () => {
    const raw = makeShipment()
    const event = transformTracking(raw)[0]

    expect(event.id).toBe('9001')
    expect(event.trackingNumber).toBe('1Z999AA10123456784')
    expect(event.carrierId).toBe('UPS')
    expect(event.status).toBe('DELIVERED')
    expect(event.description).toBe('Completed')
    expect(event.occurredAt).toBeInstanceOf(Date)
    expect(event.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata (raw shipment) on every event', () => {
    const raw = makeShipment()
    const events = transformTracking(raw)
    events.forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('returns empty array when no tracking number and no status', () => {
    const raw = makeShipment({ tracking_number: null, status: null })
    expect(transformTracking(raw)).toHaveLength(0)
  })

  it('maps Processing status to IN_TRANSIT', () => {
    const raw = makeShipment({ status: 'Processing' })
    expect(transformTracking(raw)[0].status).toBe('IN_TRANSIT')
  })

  it('maps Exception status to FAILURE', () => {
    const raw = makeShipment({ status: 'Exception' })
    expect(transformTracking(raw)[0].status).toBe('FAILURE')
  })

  it('maps LabeledCreated status to PRE_TRANSIT', () => {
    const raw = makeShipment({ status: 'LabeledCreated' })
    expect(transformTracking(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps CleanSweeped status to RETURN_TO_SENDER', () => {
    const raw = makeShipment({ status: 'CleanSweeped' })
    expect(transformTracking(raw)[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw = makeShipment({ status: 'NewFutureStatus' })
    expect(transformTracking(raw)[0].status).toBe('UNKNOWN')
  })

  it('uses last_update_at for occurredAt, falls back to created_date', () => {
    const raw = makeShipment({ last_update_at: null })
    const event = transformTracking(raw)[0]
    expect(event.occurredAt).toEqual(new Date('2024-06-01T12:00:00Z'))
  })

  it('maps shipmentId from order_id', () => {
    const raw = makeShipment({ order_id: 99999 })
    expect(transformTracking(raw)[0].shipmentId).toBe('99999')
  })

  it('handles null order_id gracefully', () => {
    const raw = makeShipment({ order_id: null })
    expect(transformTracking(raw)[0].shipmentId).toBeUndefined()
  })
})
