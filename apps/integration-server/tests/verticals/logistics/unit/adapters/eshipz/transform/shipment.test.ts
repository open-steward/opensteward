import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type EshipzShipment,
} from '../../../../../../../src/verticals/logistics/adapters/eshipz/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeShipment(overrides: Partial<EshipzShipment> = {}): EshipzShipment {
  return {
    order_id: 'ESZ-ORD-001',
    slug: 'delhivery',
    service_type: 'SURFACE',
    status: 'booked',
    awb: 'AWB001234567890',
    charged_weight: { value: 0.75, unit: 'kg' },
    shipment: {
      ship_from: {
        contact_name: 'Shipper Name',
        company_name: 'Shipper Corp',
        street1: '10 MG Road',
        city: 'Bangalore',
        state: 'KA',
        postal_code: '560001',
        country: 'IN',
        phone: '+918012345678',
      },
      ship_to: {
        contact_name: 'Receiver Name',
        street1: '5 Park St',
        city: 'Mumbai',
        state: 'MH',
        postal_code: '400001',
        country: 'IN',
      },
    },
    files: {
      label: {
        label_meta: {
          url: 'https://eshipz.com/labels/AWB001234567890.pdf',
          awb: 'AWB001234567890',
        },
      },
    },
    expected_delivery_date: '2024-03-04T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

// ─── transformShipment ────────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps id from order_id (stringified)', () => {
    // String(raw.order_id) → id — verified in source
    expect(transformShipment(makeShipment()).id).toBe('ESZ-ORD-001')
  })

  it('maps trackingNumber from label_meta.awb, preferring it over raw.awb', () => {
    // files.label.label_meta.awb ?? raw.awb → trackingNumber — verified in source
    expect(transformShipment(makeShipment()).trackingNumber).toBe('AWB001234567890')
  })

  it('falls back trackingNumber to raw.awb when label_meta is absent', () => {
    const result = transformShipment(makeShipment({ files: null }))
    expect(result.trackingNumber).toBe('AWB001234567890')
  })

  it('maps carrierId from slug', () => {
    // raw.slug → carrierId — verified in source
    expect(transformShipment(makeShipment()).carrierId).toBe('delhivery')
  })

  it('maps serviceCode from service_type', () => {
    expect(transformShipment(makeShipment()).serviceCode).toBe('SURFACE')
  })

  it('maps status: booked → LABEL_CREATED', () => {
    expect(transformShipment(makeShipment({ status: 'booked' })).status).toBe('LABEL_CREATED')
  })

  it('maps status: intransit → IN_TRANSIT', () => {
    expect(transformShipment(makeShipment({ status: 'intransit' })).status).toBe('IN_TRANSIT')
  })

  it('maps status: delivered → DELIVERED', () => {
    expect(transformShipment(makeShipment({ status: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps originAddress city', () => {
    expect(transformShipment(makeShipment()).originAddress?.city).toBe('Bangalore')
  })

  it('maps destinationAddress city', () => {
    expect(transformShipment(makeShipment()).destinationAddress?.city).toBe('Mumbai')
  })

  it('maps totalWeight from charged_weight', () => {
    const result = transformShipment(makeShipment())
    // raw.charged_weight → totalWeight — verified in source
    expect(result.totalWeight?.value).toBe(0.75)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps labelUrl from label_meta.url', () => {
    expect(transformShipment(makeShipment()).labelUrl).toBe(
      'https://eshipz.com/labels/AWB001234567890.pdf',
    )
  })

  it('maps estimatedDeliveryAt to Date', () => {
    expect(transformShipment(makeShipment()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('parses as ShipmentSchema without throwing', () => {
    const result = transformShipment(makeShipment())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
