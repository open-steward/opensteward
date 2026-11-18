import { describe, it, expect } from 'vitest'
import { transformOrder, type ShiprocketOrder } from '../../../../../src/verticals/logistics/adapters/shiprocket/transform/order'
import { transformShipment, type ShiprocketShipment } from '../../../../../src/verticals/logistics/adapters/shiprocket/transform/shipment'
import { transformTracking, type ShiprocketTrackingData } from '../../../../../src/verticals/logistics/adapters/shiprocket/transform/tracking'
import { transformRate, type ShiprocketCourierRate } from '../../../../../src/verticals/logistics/adapters/shiprocket/transform/rate'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<ShiprocketOrder> = {}): ShiprocketOrder {
  return {
    id: 10001,
    channel_order_id: 'SHOP-1001',
    order_id: 'SR-1001',
    status: 'NEW',
    status_code: 1,
    customer_name: 'Rahul Sharma',
    customer_email: 'rahul@example.com',
    customer_phone: '9876543210',
    shipping_address: '42 MG Road',
    shipping_address_2: 'Suite 5',
    shipping_city: 'Mumbai',
    shipping_state: 'Maharashtra',
    shipping_pincode: '400001',
    shipping_country: 'India',
    billing_address: '42 MG Road',
    billing_address_2: 'Suite 5',
    billing_city: 'Mumbai',
    billing_state: 'Maharashtra',
    billing_pincode: '400001',
    billing_country: 'India',
    billing_customer_name: 'Rahul Sharma',
    billing_phone: '9876543210',
    billing_email: 'rahul@example.com',
    order_items: [
      {
        id: 501,
        name: 'Cotton T-Shirt',
        sku: 'TSH-BLK-L',
        units: 2,
        selling_price: 799,
        hsn: '6109',
      },
      {
        id: 502,
        name: 'Denim Jeans',
        sku: 'JNS-BLU-32',
        units: 1,
        selling_price: 1499,
        hsn: '6204',
      },
    ],
    shipments: [{ id: 5001 }],
    payment_method: 'Prepaid',
    sub_total: 3097,
    shipping_charges: 50,
    discount: 100,
    total: 3047,
    channel_id: 1,
    channel_name: 'Custom',
    courier_name: 'Delhivery',
    awb_code: 'DLV123456',
    pickup_location: 'Primary',
    order_date: '2024-06-01T10:00:00Z',
    created_at: '2024-06-01T10:05:00Z',
    updated_at: '2024-06-01T12:00:00Z',
    ...overrides,
  }
}

function makeShipment(overrides: Partial<ShiprocketShipment> = {}): ShiprocketShipment {
  return {
    id: 5001,
    order_id: 10001,
    awb_code: 'DLV123456',
    courier_company_id: 7,
    courier_name: 'Delhivery',
    status: 'IN_TRANSIT',
    pickup_scheduled_date: '2024-06-02T09:00:00Z',
    delivered_date: null,
    weight: 0.8,
    dimensions: '20x15x10',
    billing_customer_name: 'Warehouse Delhi',
    billing_address: '10 Industrial Area',
    billing_address_2: null,
    billing_city: 'Delhi',
    billing_state: 'Delhi',
    billing_pincode: '110001',
    billing_country: 'India',
    billing_phone: '1111111111',
    billing_email: 'warehouse@example.com',
    shipping_customer_name: 'Rahul Sharma',
    shipping_address: '42 MG Road',
    shipping_address_2: 'Suite 5',
    shipping_city: 'Mumbai',
    shipping_state: 'Maharashtra',
    shipping_pincode: '400001',
    shipping_country: 'India',
    shipping_phone: '9876543210',
    shipping_email: 'rahul@example.com',
    etd: '2024-06-05T18:00:00Z',
    created_at: '2024-06-01T10:05:00Z',
    updated_at: '2024-06-02T09:30:00Z',
    ...overrides,
  }
}

function makeTrackingData(overrides: Partial<ShiprocketTrackingData> = {}): ShiprocketTrackingData {
  return {
    tracking_data: {
      track_status: 1,
      shipment_status: 7,
      shipment_track: [
        {
          id: 5001,
          // shipmentId is read from `shipment_id`, a distinct field from
          // `id`, not from the route argument.
          shipment_id: 5001,
          awb_code: 'DLV123456',
          courier_company_id: 7,
          courier_name: 'Delhivery',
          current_status: 'In Transit',
        },
      ],
      shipment_track_activities: [
        {
          date: '2024-06-02T09:00:00Z',
          status: 'Pickup Scheduled',
          activity: 'Shipment pickup scheduled',
          location: 'Delhi',
          sr_status: 'pickup_scheduled',
        },
        {
          date: '2024-06-02T14:00:00Z',
          status: 'Picked Up',
          activity: 'Shipment picked up by courier',
          location: 'Delhi',
          sr_status: 'picked_up',
        },
        {
          date: '2024-06-03T08:00:00Z',
          status: 'In Transit',
          activity: 'Shipment in transit to destination city',
          location: 'Nagpur',
          sr_status: 'in_transit',
        },
      ],
    },
    ...overrides,
  }
}

function makeCourierRate(overrides: Partial<ShiprocketCourierRate> = {}): ShiprocketCourierRate {
  return {
    courier_company_id: 7,
    courier_name: 'Delhivery',
    courier_type: 'Surface',
    freight_charge: 45,
    cod_charges: 0,
    rate: 52.5,
    estimated_delivery_days: '4',
    etd: '2024-06-05T18:00:00Z',
    is_surface: true,
    is_rto_address_available: true,
    min_weight: 0.5,
    ...overrides,
  }
}

// ─── transformOrder ─────────────────────────────────────────────────────────

describe('transformOrder (Shiprocket)', () => {
  it('maps all canonical fields', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)

    expect(result.id).toBe('10001')
    expect(result.status).toBe('PENDING')
    expect(result.orderNumber).toBe('SHOP-1001')
    expect(result.totalAmount).toBe(3047)
    expect(result.subtotalAmount).toBe(3097)
    expect(result.shippingAmount).toBe(50)
    expect(result.discountAmount).toBe(100)
    expect(result.requestedServiceCode).toBe('Delhivery')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.orderAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps destination address from shipping fields', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)

    expect(result.destinationAddress?.name).toBe('Rahul Sharma')
    expect(result.destinationAddress?.street1).toBe('42 MG Road')
    expect(result.destinationAddress?.street2).toBe('Suite 5')
    expect(result.destinationAddress?.city).toBe('Mumbai')
    expect(result.destinationAddress?.state).toBe('Maharashtra')
    expect(result.destinationAddress?.postalCode).toBe('400001')
    expect(result.destinationAddress?.country).toBe('India')
  })

  it('maps line items from order_items', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)

    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].sku).toBe('TSH-BLK-L')
    expect(result.lineItems![0].name).toBe('Cotton T-Shirt')
    expect(result.lineItems![0].quantity).toBe(2)
    expect(result.lineItems![0].unitAmount).toBe(799)
    expect(result.lineItems![1].sku).toBe('JNS-BLU-32')
  })

  it('maps shipment IDs', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.shipmentIds).toEqual(['5001'])
  })

  it('passes through metadata unmodified', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('falls back to order_id when channel_order_id is null', () => {
    const raw = makeOrder({ channel_order_id: null })
    expect(transformOrder(raw).orderNumber).toBe('SR-1001')
  })

  it('returns undefined shipmentIds when shipments is empty', () => {
    const raw = makeOrder({ shipments: [] })
    expect(transformOrder(raw).shipmentIds).toBeUndefined()
  })

  it('handles null order_items gracefully', () => {
    const raw = makeOrder({ order_items: null })
    expect(transformOrder(raw).lineItems).toBeUndefined()
  })

  it('maps all order statuses correctly', () => {
    const cases: [string, string][] = [
      ['NEW', 'PENDING'],
      ['READY_TO_SHIP', 'AWAITING_SHIPMENT'],
      ['PICKUP_SCHEDULED', 'AWAITING_SHIPMENT'],
      ['PICKUP_QUEUED', 'AWAITING_SHIPMENT'],
      ['PICKED_UP', 'SHIPPED'],
      ['IN_TRANSIT', 'SHIPPED'],
      ['OUT_FOR_DELIVERY', 'SHIPPED'],
      ['DELIVERED', 'DELIVERED'],
      ['CANCELLED', 'CANCELLED'],
      ['RTO_INITIATED', 'RETURNED'],
      ['RTO_DELIVERED', 'RETURNED'],
    ]
    for (const [srStatus, expected] of cases) {
      const raw = makeOrder({ status: srStatus })
      expect(transformOrder(raw).status).toBe(expected)
    }
  })

  it('maps unknown status to PENDING', () => {
    const raw = makeOrder({ status: 'FUTURE_STATUS' })
    expect(transformOrder(raw).status).toBe('PENDING')
  })

  it('maps null status to PENDING', () => {
    const raw = makeOrder({ status: null })
    expect(transformOrder(raw).status).toBe('PENDING')
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('transformShipment (Shiprocket)', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('5001')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('DLV123456')
    expect(result.carrierId).toBe('Delhivery')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin address from billing fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Warehouse Delhi')
    expect(result.originAddress?.city).toBe('Delhi')
    expect(result.originAddress?.postalCode).toBe('110001')
  })

  it('maps destination address from shipping fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.destinationAddress?.name).toBe('Rahul Sharma')
    expect(result.destinationAddress?.city).toBe('Mumbai')
    expect(result.destinationAddress?.postalCode).toBe('400001')
  })

  it('maps weight', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(0.8)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps delivery dates', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.actualDeliveryAt).toBeUndefined() // delivered_date is null
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipment({
      awb_code: null,
      courier_name: null,
      weight: null,
      etd: null,
      billing_customer_name: null,
      billing_address: null,
      billing_city: null,
      shipping_customer_name: null,
      shipping_address: null,
      shipping_city: null,
    })
    const result = transformShipment(raw)

    expect(result.trackingNumber).toBeUndefined()
    expect(result.carrierId).toBeUndefined()
    expect(result.totalWeight).toBeUndefined()
    expect(result.estimatedDeliveryAt).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string, string][] = [
      ['PICKUP_SCHEDULED', 'LABEL_CREATED'],
      ['PICKED_UP', 'IN_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['RTO', 'RETURNED'],
      ['LOST', 'EXCEPTION'],
    ]
    for (const [srStatus, expected] of cases) {
      const raw = makeShipment({ status: srStatus })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw = makeShipment({ status: 'FUTURE_STATUS' })
    expect(transformShipment(raw).status).toBe('UNKNOWN')
  })
})

// ─── transformTracking ──────────────────────────────────────────────────────

describe('transformTracking (Shiprocket)', () => {
  it('produces one event per activity', () => {
    const raw = makeTrackingData()
    const events = transformTracking(raw, '5001')
    expect(events).toHaveLength(3)
  })

  it('maps tracking fields to canonical event', () => {
    const raw = makeTrackingData()
    const events = transformTracking(raw, '5001')
    const first = events[0]

    expect(first.shipmentId).toBe('5001')
    expect(first.trackingNumber).toBe('DLV123456')
    expect(first.carrierId).toBe('Delhivery')
    expect(first.status).toBe('PRE_TRANSIT')
    expect(first.description).toBe('Shipment pickup scheduled')
    expect(first.occurredAt).toBeInstanceOf(Date)
  })

  it('maps all tracking statuses correctly', () => {
    const cases: [string, string][] = [
      ['pickup_scheduled', 'PRE_TRANSIT'],
      ['picked_up', 'PRE_TRANSIT'],
      ['in_transit', 'IN_TRANSIT'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['rto_initiated', 'RETURN_TO_SENDER'],
      ['rto_delivered', 'RETURN_TO_SENDER'],
      ['lost', 'FAILURE'],
    ]
    for (const [srStatus, expected] of cases) {
      const raw: ShiprocketTrackingData = {
        tracking_data: {
          track_status: 1,
          shipment_status: 1,
          shipment_track: [{ id: 1, shipment_id: 1, awb_code: 'AWB1', courier_company_id: 1, courier_name: 'Test', current_status: 'test' }],
          shipment_track_activities: [{ date: '2024-01-01', status: 'test', activity: 'test', location: null, sr_status: srStatus }],
        },
      }
      expect(transformTracking(raw, '1')[0].status).toBe(expected)
    }
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw: ShiprocketTrackingData = {
      tracking_data: {
        track_status: 1,
        shipment_status: 1,
        shipment_track: [{ id: 1, shipment_id: 1, awb_code: 'AWB1', courier_company_id: 1, courier_name: 'Test', current_status: 'test' }],
        shipment_track_activities: [{ date: '2024-01-01', status: 'test', activity: 'test', location: null, sr_status: 'new_status' }],
      },
    }
    expect(transformTracking(raw, '1')[0].status).toBe('UNKNOWN')
  })

  it('returns empty array when no activities', () => {
    const raw: ShiprocketTrackingData = {
      tracking_data: {
        track_status: 0,
        shipment_status: 0,
        shipment_track: null,
        shipment_track_activities: [],
      },
    }
    expect(transformTracking(raw, '1')).toHaveLength(0)
  })

  it('passes through metadata on every event', () => {
    const raw = makeTrackingData()
    const events = transformTracking(raw, '5001')
    events.forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('maps location in tracking event', () => {
    const raw = makeTrackingData()
    const events = transformTracking(raw, '5001')
    expect(events[0].location?.city).toBe('Delhi')
  })

  it('handles null location gracefully', () => {
    const raw: ShiprocketTrackingData = {
      tracking_data: {
        track_status: 1,
        shipment_status: 1,
        shipment_track: [{ id: 1, shipment_id: 1, awb_code: 'AWB1', courier_company_id: 1, courier_name: 'Test', current_status: 'test' }],
        shipment_track_activities: [{ date: '2024-01-01', status: 'test', activity: 'test', location: null, sr_status: 'in_transit' }],
      },
    }
    expect(transformTracking(raw, '1')[0].location).toBeUndefined()
  })
})

// ─── transformRate ──────────────────────────────────────────────────────────

describe('transformRate (Shiprocket)', () => {
  it('maps canonical fields', () => {
    const raw = makeCourierRate()
    const result = transformRate(raw)

    expect(result.id).toBe('7')
    expect(result.carrierId).toBe('Delhivery')
    expect(result.serviceCode).toBe('Surface')
    expect(result.serviceName).toBe('Delhivery')
    expect(result.currency).toBe('INR')
    expect(result.totalAmount).toBe(52.5)
    expect(result.transitDays).toBe(4)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeCourierRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles null fields gracefully', () => {
    const raw = makeCourierRate({
      courier_name: null,
      courier_type: null,
      rate: null,
      estimated_delivery_days: null,
      etd: null,
    })
    const result = transformRate(raw)

    expect(result.carrierId).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.transitDays).toBeUndefined()
    expect(result.estimatedDeliveryAt).toBeUndefined()
  })

  it('rounds up transit days from fractional estimate', () => {
    const raw = makeCourierRate({ estimated_delivery_days: '3.5' })
    expect(transformRate(raw).transitDays).toBe(4)
  })
})
