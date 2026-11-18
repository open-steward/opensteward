import { describe, it, expect } from 'vitest'
import { transformRate, type UPSRatedShipment } from '../../../../../src/verticals/logistics/adapters/ups/transform/rate'
import { transformTrackingPackage, type UPSTrackingPackage, type UPSTrackingActivity } from '../../../../../src/verticals/logistics/adapters/ups/transform/tracking'
import { transformShipment, type UPSShipmentResults } from '../../../../../src/verticals/logistics/adapters/ups/transform/shipment'
import { transformLabel } from '../../../../../src/verticals/logistics/adapters/ups/transform/label'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRatedShipment(overrides: Partial<UPSRatedShipment> = {}): UPSRatedShipment {
  return {
    Service: { Code: '03', Description: 'UPS Ground' },
    TotalCharges: { MonetaryValue: '12.50', CurrencyCode: 'USD' },
    BillingWeight: {
      Weight: '5.0',
      UnitOfMeasurement: { Code: 'LBS' },
    },
    GuaranteedDelivery: {
      BusinessDaysInTransit: '3',
    },
    ...overrides,
  }
}

function makeTrackingActivity(overrides: Partial<UPSTrackingActivity> = {}): UPSTrackingActivity {
  return {
    date: '20240115',
    time: '143022',
    location: {
      address: {
        city: 'Louisville',
        stateProvince: 'KY',
        countryCode: 'US',
      },
    },
    status: {
      type: 'I',
      code: 'IN',
      description: 'In Transit',
    },
    ...overrides,
  }
}

function makeTrackingPackage(overrides: Partial<UPSTrackingPackage> = {}): UPSTrackingPackage {
  return {
    trackingNumber: '1Z999AA10123456784',
    activity: [makeTrackingActivity()],
    currentStatus: {
      type: 'I',
      code: 'IN',
      description: 'In Transit',
    },
    deliveryDate: [{ date: '20240118' }],
    ...overrides,
  }
}

function makeShipmentResults(overrides: Partial<UPSShipmentResults> = {}): UPSShipmentResults {
  return {
    ShipmentIdentificationNumber: '1Z999AA10123456784',
    ShipmentCharges: {
      TotalCharges: {
        MonetaryValue: '15.75',
        CurrencyCode: 'USD',
      },
    },
    PackageResults: [
      {
        TrackingNumber: '1Z999AA10123456784',
        ShippingLabel: {
          GraphicImage: 'iVBORw0KGgoAAAANS...base64data...',
          ImageFormat: { Code: 'PNG' },
        },
      },
    ],
    ...overrides,
  }
}

// ─── transformRate ───────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRatedShipment()
    const result = transformRate(raw)

    expect(result.id).toBe('03')
    expect(result.carrierId).toBe('UPS')
    expect(result.serviceCode).toBe('03')
    expect(result.serviceName).toBe('UPS Ground')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(12.5)
    expect(result.transitDays).toBe(3)
    expect(result.deliveryDays).toBe(3)
    expect(result.isGuaranteedDelivery).toBe(true)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRatedShipment()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing GuaranteedDelivery', () => {
    const raw = makeRatedShipment({ GuaranteedDelivery: undefined })
    const result = transformRate(raw)
    expect(result.transitDays).toBeUndefined()
    expect(result.deliveryDays).toBeUndefined()
    expect(result.isGuaranteedDelivery).toBeUndefined()
  })

  it('parses TotalCharges.MonetaryValue as decimal from string', () => {
    const raw = makeRatedShipment({
      TotalCharges: { MonetaryValue: '99.99', CurrencyCode: 'CAD' },
    })
    const result = transformRate(raw)
    expect(result.totalAmount).toBe(99.99)
    expect(result.currency).toBe('CAD')
  })

  it('maps known service codes to service names', () => {
    const cases: [string, string][] = [
      ['01', 'UPS Next Day Air'],
      ['02', 'UPS 2nd Day Air'],
      ['03', 'UPS Ground'],
      ['12', 'UPS 3 Day Select'],
      ['65', 'UPS Saver'],
    ]
    for (const [code, expectedName] of cases) {
      const raw = makeRatedShipment({ Service: { Code: code } })
      expect(transformRate(raw).serviceName).toBe(expectedName)
    }
  })

  it('falls back to Description for unknown service codes', () => {
    const raw = makeRatedShipment({
      Service: { Code: '99', Description: 'Custom Service' },
    })
    expect(transformRate(raw).serviceName).toBe('Custom Service')
  })
})

// ─── transformTrackingPackage ────────────────────────────────────────────────

describe('transformTrackingPackage', () => {
  it('produces one event per activity', () => {
    const raw = makeTrackingPackage()
    const events = transformTrackingPackage(raw)
    expect(events).toHaveLength(1)
  })

  it('maps activity fields to canonical event', () => {
    const raw = makeTrackingPackage()
    const event = transformTrackingPackage(raw)[0]

    expect(event.trackingNumber).toBe('1Z999AA10123456784')
    expect(event.carrierId).toBe('UPS')
    expect(event.status).toBe('IN_TRANSIT')
    expect(event.description).toBe('In Transit')
    expect(event.location?.city).toBe('Louisville')
    expect(event.location?.state).toBe('KY')
    expect(event.location?.country).toBe('US')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('parses UPS date/time format correctly', () => {
    const raw = makeTrackingPackage({
      activity: [makeTrackingActivity({ date: '20240115', time: '083000' })],
    })
    const event = transformTrackingPackage(raw)[0]
    expect(event.occurredAt).toEqual(new Date('2024-01-15T08:30:00Z'))
  })

  it('passes through metadata (raw package) on every event', () => {
    const raw = makeTrackingPackage()
    const events = transformTrackingPackage(raw)
    events.forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits a single summary event when activity is empty', () => {
    const raw = makeTrackingPackage({ activity: [] })
    const events = transformTrackingPackage(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('IN_TRANSIT')
    expect(events[0].description).toBe('In Transit')
  })

  it('maps all UPS tracking status types correctly', () => {
    const cases: [string, string][] = [
      ['M', 'PRE_TRANSIT'],
      ['I', 'IN_TRANSIT'],
      ['D', 'DELIVERED'],
      ['X', 'FAILURE'],
      ['P', 'IN_TRANSIT'],
    ]
    for (const [upsStatus, expected] of cases) {
      const raw = makeTrackingPackage({
        activity: [],
        currentStatus: { type: upsStatus, description: 'test' },
      })
      expect(transformTrackingPackage(raw)[0].status).toBe(expected)
    }
  })

  it('maps unknown status type to UNKNOWN', () => {
    const raw = makeTrackingPackage({
      activity: [],
      currentStatus: { type: 'Z', description: 'unknown' },
    })
    expect(transformTrackingPackage(raw)[0].status).toBe('UNKNOWN')
  })

  it('handles missing location gracefully', () => {
    const raw = makeTrackingPackage({
      activity: [makeTrackingActivity({ location: undefined })],
    })
    const event = transformTrackingPackage(raw)[0]
    expect(event.location).toBeUndefined()
  })

  it('handles missing status description', () => {
    const raw = makeTrackingPackage({
      activity: [makeTrackingActivity({ status: { type: 'I', code: 'IN' } })],
    })
    const event = transformTrackingPackage(raw)[0]
    expect(event.description).toBeUndefined()
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResults()
    const result = transformShipment(raw)

    expect(result.id).toBe('1Z999AA10123456784')
    expect(result.status).toBe('LABEL_CREATED')
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.carrierId).toBe('UPS')
  })

  it('maps cost from ShipmentCharges', () => {
    const raw = makeShipmentResults()
    const result = transformShipment(raw)

    expect(result.cost?.amount).toBe(15.75)
    expect(result.cost?.currency).toBe('USD')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResults()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing PackageResults gracefully', () => {
    const raw = makeShipmentResults({ PackageResults: undefined })
    const result = transformShipment(raw)
    // Falls back to ShipmentIdentificationNumber
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
  })

  it('handles missing ShipmentCharges gracefully', () => {
    const raw = makeShipmentResults({ ShipmentCharges: undefined })
    const result = transformShipment(raw)
    expect(result.cost).toBeUndefined()
  })

  it('handles completely empty results', () => {
    const raw = makeShipmentResults({
      ShipmentIdentificationNumber: undefined,
      ShipmentCharges: undefined,
      PackageResults: undefined,
    })
    const result = transformShipment(raw)
    expect(result.id).toBeUndefined()
    expect(result.trackingNumber).toBeUndefined()
    expect(result.cost).toBeUndefined()
  })
})

// ─── transformLabel ─────────────────────────────────────────────────────────

describe('transformLabel', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResults()
    const result = transformLabel(raw)

    expect(result.id).toBe('1Z999AA10123456784')
    expect(result.shipmentId).toBe('1Z999AA10123456784')
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.carrierId).toBe('UPS')
    expect(result.format).toBe('PNG')
    expect(result.base64).toBe('iVBORw0KGgoAAAANS...base64data...')
    expect(result.status).toBe('CREATED')
  })

  it('maps cost from ShipmentCharges', () => {
    const raw = makeShipmentResults()
    const result = transformLabel(raw)

    expect(result.cost?.amount).toBe(15.75)
    expect(result.cost?.currency).toBe('USD')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResults()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('maps ZPL format', () => {
    const raw = makeShipmentResults({
      PackageResults: [
        {
          TrackingNumber: '1Z999AA10123456784',
          ShippingLabel: {
            GraphicImage: 'zpldata',
            ImageFormat: { Code: 'ZPL' },
          },
        },
      ],
    })
    expect(transformLabel(raw).format).toBe('ZPL')
  })

  it('maps GIF format to PNG', () => {
    const raw = makeShipmentResults({
      PackageResults: [
        {
          TrackingNumber: '1Z999AA10123456784',
          ShippingLabel: {
            GraphicImage: 'gifdata',
            ImageFormat: { Code: 'GIF' },
          },
        },
      ],
    })
    expect(transformLabel(raw).format).toBe('PNG')
  })

  it('handles missing PackageResults', () => {
    const raw = makeShipmentResults({ PackageResults: undefined })
    const result = transformLabel(raw)
    expect(result.trackingNumber).toBeUndefined()
    expect(result.format).toBeUndefined()
    expect(result.base64).toBeUndefined()
  })

  it('handles missing ShipmentCharges', () => {
    const raw = makeShipmentResults({ ShipmentCharges: undefined })
    expect(transformLabel(raw).cost).toBeUndefined()
  })

  it('supports packageIndex for multi-package shipments', () => {
    const raw = makeShipmentResults({
      PackageResults: [
        {
          TrackingNumber: '1Z999AA10000000001',
          ShippingLabel: { GraphicImage: 'label1', ImageFormat: { Code: 'PNG' } },
        },
        {
          TrackingNumber: '1Z999AA10000000002',
          ShippingLabel: { GraphicImage: 'label2', ImageFormat: { Code: 'ZPL' } },
        },
      ],
    })
    const label0 = transformLabel(raw, 0)
    const label1 = transformLabel(raw, 1)

    expect(label0.trackingNumber).toBe('1Z999AA10000000001')
    expect(label0.base64).toBe('label1')
    expect(label0.format).toBe('PNG')

    expect(label1.trackingNumber).toBe('1Z999AA10000000002')
    expect(label1.base64).toBe('label2')
    expect(label1.format).toBe('ZPL')
  })
})
