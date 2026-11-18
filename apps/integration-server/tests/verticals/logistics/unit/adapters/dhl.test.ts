import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type DHLProduct,
} from '../../../../../src/verticals/logistics/adapters/dhl/transform/rate'
import {
  transformTracking,
  type DHLTrackingShipment,
} from '../../../../../src/verticals/logistics/adapters/dhl/transform/tracking'
import {
  transformShipment,
  type DHLShipmentResponse,
} from '../../../../../src/verticals/logistics/adapters/dhl/transform/shipment'
import {
  transformLabel,
  transformLabels,
  type DHLDocument,
} from '../../../../../src/verticals/logistics/adapters/dhl/transform/label'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<DHLProduct> = {}): DHLProduct {
  return {
    productName: 'EXPRESS WORLDWIDE',
    productCode: 'P',
    localProductCode: 'P',
    totalPrice: [
      { currencyType: 'BILLC', priceCurrency: 'USD', price: 125.5 },
      { currencyType: 'PULCL', priceCurrency: 'EUR', price: 115.0 },
    ],
    deliveryCapabilities: {
      estimatedDeliveryDateAndTime: '2024-03-15T18:00:00',
      totalTransitDays: 3,
    },
    weight: { provided: 2.5, unitOfMeasurement: 'KG' },
    ...overrides,
  }
}

function makeTrackingShipment(overrides: Partial<DHLTrackingShipment> = {}): DHLTrackingShipment {
  return {
    shipmentTrackingNumber: '1234567890',
    status: 'transit',
    shipmentTimestamp: '2024-03-10T09:00:00Z',
    estimatedDeliveryDate: '2024-03-15',
    events: [
      {
        date: '2024-03-10',
        time: '09:00:00',
        typeCode: 'PU',
        description: 'Shipment picked up',
        serviceArea: [{ code: 'US', description: 'Cincinnati' }],
      },
      {
        date: '2024-03-11',
        time: '14:30:00',
        typeCode: 'DF',
        description: 'Departed facility',
        serviceArea: [{ code: 'US', description: 'Cincinnati Hub' }],
      },
    ],
    numberOfPieces: 1,
    ...overrides,
  }
}

function makeShipmentResponse(overrides: Partial<DHLShipmentResponse> = {}): DHLShipmentResponse {
  return {
    shipmentTrackingNumber: '9876543210',
    trackingUrl: 'https://www.dhl.com/track?id=9876543210',
    packages: [
      {
        trackingNumber: '9876543210',
        referenceNumber: 'MY-REF-001',
        volumetricWeight: 3.5,
      },
    ],
    documents: [
      {
        imageFormat: 'PDF',
        content: 'JVBERi0xLjQK',
        typeCode: 'label',
      },
    ],
    shipmentCharges: [
      { currencyType: 'BILLC', priceCurrency: 'USD', price: 89.99 },
      { currencyType: 'PULCL', priceCurrency: 'EUR', price: 82.5 },
    ],
    ...overrides,
  }
}

function makeDocument(overrides: Partial<DHLDocument> = {}): DHLDocument {
  return {
    imageFormat: 'PDF',
    content: 'JVBERi0xLjQK',
    typeCode: 'label',
    ...overrides,
  }
}

// ─── transformRate ──────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeProduct()
    const result = transformRate(raw)

    expect(result.id).toBe('P')
    expect(result.carrierId).toBe('dhl')
    expect(result.serviceCode).toBe('P')
    expect(result.serviceName).toBe('EXPRESS WORLDWIDE')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(125.5)
    expect(result.transitDays).toBe(3)
    expect(result.deliveryDays).toBe(3)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeProduct()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('uses BILLC entry for currency and amount', () => {
    const raw = makeProduct({
      totalPrice: [
        { currencyType: 'PULCL', priceCurrency: 'EUR', price: 100.0 },
        { currencyType: 'BILLC', priceCurrency: 'GBP', price: 85.0 },
      ],
    })
    const result = transformRate(raw)
    expect(result.currency).toBe('GBP')
    expect(result.totalAmount).toBe(85.0)
  })

  it('falls back to first price entry when no BILLC', () => {
    const raw = makeProduct({
      totalPrice: [
        { currencyType: 'PULCL', priceCurrency: 'EUR', price: 100.0 },
      ],
    })
    const result = transformRate(raw)
    expect(result.currency).toBe('EUR')
    expect(result.totalAmount).toBe(100.0)
  })

  it('handles missing deliveryCapabilities', () => {
    const raw = makeProduct({ deliveryCapabilities: null })
    const result = transformRate(raw)
    expect(result.transitDays).toBeUndefined()
    expect(result.deliveryDays).toBeUndefined()
    expect(result.estimatedDeliveryAt).toBeUndefined()
  })

  it('handles empty totalPrice array', () => {
    const raw = makeProduct({ totalPrice: [] })
    const result = transformRate(raw)
    expect(result.currency).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
  })
})

// ─── transformTracking ──────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingShipment()
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingShipment()
    const event = transformTracking(raw)[0]

    expect(event.trackingNumber).toBe('1234567890')
    expect(event.carrierId).toBe('dhl')
    expect(event.status).toBe('IN_TRANSIT')
    expect(event.description).toBe('Shipment picked up')
    expect(event.location?.city).toBe('Cincinnati')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata (raw tracking) on every event', () => {
    const raw = makeTrackingShipment()
    const events = transformTracking(raw)
    events.forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits a single fallback event when events is empty', () => {
    const raw = makeTrackingShipment({ events: [] })
    const events = transformTracking(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('1234567890')
  })

  it('uses provided trackingNumber over shipmentTrackingNumber', () => {
    const raw = makeTrackingShipment()
    const events = transformTracking(raw, 'OVERRIDE-123')
    expect(events[0].trackingNumber).toBe('OVERRIDE-123')
  })

  it('maps all DHL typeCode values correctly', () => {
    const cases: [string, string][] = [
      ['PU', 'IN_TRANSIT'],
      ['PL', 'IN_TRANSIT'],
      ['AF', 'IN_TRANSIT'],
      ['DF', 'IN_TRANSIT'],
      ['TP', 'IN_TRANSIT'],
      ['CC', 'IN_TRANSIT'],
      ['CR', 'IN_TRANSIT'],
      ['WC', 'OUT_FOR_DELIVERY'],
      ['OK', 'DELIVERED'],
      ['RR', 'RETURN_TO_SENDER'],
      ['DD', 'FAILURE'],
      ['OH', 'FAILURE'],
      ['NH', 'FAILURE'],
      ['XX', 'UNKNOWN'],
    ]
    for (const [typeCode, expected] of cases) {
      const raw = makeTrackingShipment({
        events: [
          {
            date: '2024-03-10',
            time: '09:00:00',
            typeCode,
            description: 'test',
            serviceArea: null,
          },
        ],
      })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })

  it('handles null serviceArea gracefully', () => {
    const raw = makeTrackingShipment({
      events: [
        {
          date: '2024-03-10',
          time: '09:00:00',
          typeCode: 'PU',
          description: 'Picked up',
          serviceArea: null,
        },
      ],
    })
    const event = transformTracking(raw)[0]
    expect(event.location).toBeUndefined()
  })

  it('handles null date gracefully', () => {
    const raw = makeTrackingShipment({
      events: [
        {
          date: null,
          time: null,
          typeCode: 'PU',
          description: 'Picked up',
          serviceArea: null,
        },
      ],
    })
    const event = transformTracking(raw)[0]
    expect(event.occurredAt).toBeUndefined()
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.id).toBe('9876543210')
    expect(result.status).toBe('LABEL_CREATED')
    expect(result.trackingNumber).toBe('9876543210')
    expect(result.carrierId).toBe('dhl')
    expect(result.labelUrl).toBe('https://www.dhl.com/track?id=9876543210')
  })

  it('maps packages with tracking numbers and references', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.packages).toHaveLength(1)
    expect(result.packages![0].trackingNumber).toBe('9876543210')
    expect(result.packages![0].reference).toBe('MY-REF-001')
  })

  it('maps cost from billing-currency charge', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.cost?.amount).toBe(89.99)
    expect(result.cost?.currency).toBe('USD')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResponse()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing shipmentCharges gracefully', () => {
    const raw = makeShipmentResponse({ shipmentCharges: [] })
    const result = transformShipment(raw)
    expect(result.cost).toBeUndefined()
  })

  it('handles missing packages gracefully', () => {
    const raw = makeShipmentResponse({ packages: [] })
    const result = transformShipment(raw)
    expect(result.packages).toEqual([])
  })

  it('handles null trackingUrl', () => {
    const raw = makeShipmentResponse({ trackingUrl: null })
    const result = transformShipment(raw)
    expect(result.labelUrl).toBeUndefined()
  })
})

// ─── transformLabel ─────────────────────────────────────────────────────────

describe('transformLabel', () => {
  it('maps canonical fields', () => {
    const shipment = makeShipmentResponse()
    const doc = makeDocument()
    const result = transformLabel(doc, shipment)

    expect(result.id).toBe('9876543210-label-pdf')
    expect(result.shipmentId).toBe('9876543210')
    expect(result.trackingNumber).toBe('9876543210')
    expect(result.carrierId).toBe('dhl')
    expect(result.format).toBe('PDF')
    expect(result.status).toBe('CREATED')
    expect(result.base64).toBe('JVBERi0xLjQK')
  })

  it('maps cost from billing-currency charge', () => {
    const shipment = makeShipmentResponse()
    const doc = makeDocument()
    const result = transformLabel(doc, shipment)

    expect(result.cost?.amount).toBe(89.99)
    expect(result.cost?.currency).toBe('USD')
  })

  it('passes through metadata (raw shipment) unmodified', () => {
    const shipment = makeShipmentResponse()
    const doc = makeDocument()
    const meta = transformLabel(doc, shipment).metadata
    expect(meta).toEqual({ ...shipment, _document: doc })
  })

  it('maps ZPL format', () => {
    const shipment = makeShipmentResponse()
    const doc = makeDocument({ imageFormat: 'ZPL' })
    expect(transformLabel(doc, shipment).format).toBe('ZPL')
  })

  it('maps PNG format', () => {
    const shipment = makeShipmentResponse()
    const doc = makeDocument({ imageFormat: 'PNG' })
    expect(transformLabel(doc, shipment).format).toBe('PNG')
  })
})

describe('transformLabels', () => {
  it('returns all label documents from a shipment', () => {
    const shipment = makeShipmentResponse({
      documents: [
        { imageFormat: 'PDF', content: 'pdf-content', typeCode: 'label' },
        { imageFormat: 'ZPL', content: 'zpl-content', typeCode: 'label' },
        { imageFormat: 'PDF', content: 'waybill-content', typeCode: 'waybillDoc' },
      ],
    })
    const labels = transformLabels(shipment)
    expect(labels).toHaveLength(2)
    expect(labels[0].format).toBe('PDF')
    expect(labels[1].format).toBe('ZPL')
  })

  it('returns empty array when no documents exist', () => {
    const shipment = makeShipmentResponse({ documents: [] })
    expect(transformLabels(shipment)).toEqual([])
  })

  it('returns empty array when no label documents exist', () => {
    const shipment = makeShipmentResponse({
      documents: [
        { imageFormat: 'PDF', content: 'waybill', typeCode: 'waybillDoc' },
      ],
    })
    expect(transformLabels(shipment)).toEqual([])
  })
})
