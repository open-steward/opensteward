import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type BringTrackingResponse,
  type BringTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/bring/transform/tracking'
import {
  transformShipment,
  type BringBookedConsignment,
} from '../../../../../src/verticals/logistics/adapters/bring/transform/shipment'
import { parseCredentials } from '../../../../../src/verticals/logistics/adapters/bring/auth'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<BringTrackingEvent> = {}): BringTrackingEvent {
  return {
    description: 'Package picked up',
    status: 'HANDED_IN',
    dateIso: '2024-03-15T10:30:00Z',
    displayDate: '15.03.2024',
    displayTime: '10:30',
    postalCode: '0001',
    city: 'Oslo',
    country: 'NO',
    unitId: 'UNIT-1',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<BringTrackingResponse> = {}): BringTrackingResponse {
  return {
    consignmentSet: [
      {
        consignmentId: 'TESTCONS123',
        previousConsignmentId: null,
        totalWeightInKgs: 2.5,
        totalVolumeInDm3: 10,
        packages: [
          {
            statusDescription: 'In transit',
            descriptions: null,
            packageNumber: 'TESTPKG123',
            dateOfReturn: null,
            dateOfEstimatedDelivery: '2024-03-18',
            eventSet: [
              makeTrackingEvent(),
              makeTrackingEvent({
                status: 'IN_TRANSIT',
                description: 'Package in transit',
                dateIso: '2024-03-15T14:00:00Z',
                city: 'Bergen',
              }),
            ],
          },
        ],
      },
    ],
    ...overrides,
  }
}

function makeBookedConsignment(overrides: Partial<BringBookedConsignment> = {}): BringBookedConsignment {
  return {
    consignmentNumber: 'CONS-456',
    productSpecificData: null,
    packages: [
      {
        packageNumber: 'PKG-789',
        correlationId: 'corr-1',
      },
    ],
    confirmation: {
      consignmentNumber: 'CONS-456',
      productCode: 'SERVICEPAKKE',
      dateOfShipment: '2024-03-15',
      links: {
        labels: 'https://api.bring.com/labels/CONS-456.pdf',
        tracking: 'https://tracking.bring.com/CONS-456',
      },
    },
    ...overrides,
  }
}

// ─── parseCredentials ───────────────────────────────────────────────────────

describe('parseCredentials', () => {
  it('splits email:apiKey correctly', () => {
    const result = parseCredentials('user@example.com:my-api-key')
    expect(result.uid).toBe('user@example.com')
    expect(result.apiKey).toBe('my-api-key')
  })

  it('handles missing colon gracefully', () => {
    const result = parseCredentials('just-a-key')
    expect(result.uid).toBe('just-a-key')
    expect(result.apiKey).toBe('')
  })

  it('handles multiple colons (key contains colon)', () => {
    const result = parseCredentials('user@example.com:key:with:colons')
    expect(result.uid).toBe('user@example.com')
    expect(result.apiKey).toBe('key:with:colons')
  })
})

// ─── transformTracking ──────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces events from all packages in all consignments', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw, 'TESTPKG123')
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw, 'TESTPKG123')[0]

    expect(event.trackingNumber).toBe('TESTPKG123')
    expect(event.carrierId).toBe('bring')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Package picked up')
    expect(event.location?.city).toBe('Oslo')
    expect(event.location?.postalCode).toBe('0001')
    expect(event.location?.country).toBe('NO')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw, 'TESTPKG123')
    events.forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a single fallback event when no events exist', () => {
    const raw = makeTrackingResponse({
      consignmentSet: [
        {
          consignmentId: 'TESTCONS123',
          previousConsignmentId: null,
          totalWeightInKgs: null,
          totalVolumeInDm3: null,
          packages: [
            {
              statusDescription: null,
              descriptions: null,
              packageNumber: 'TESTPKG123',
              dateOfReturn: null,
              dateOfEstimatedDelivery: null,
              eventSet: [],
            },
          ],
        },
      ],
    })
    const events = transformTracking(raw, 'TESTPKG123')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('handles null city gracefully', () => {
    const raw = makeTrackingResponse({
      consignmentSet: [
        {
          consignmentId: 'TESTCONS123',
          previousConsignmentId: null,
          totalWeightInKgs: null,
          totalVolumeInDm3: null,
          packages: [
            {
              statusDescription: null,
              descriptions: null,
              packageNumber: 'TESTPKG123',
              dateOfReturn: null,
              dateOfEstimatedDelivery: null,
              eventSet: [
                makeTrackingEvent({ city: null, postalCode: null, country: null }),
              ],
            },
          ],
        },
      ],
    })
    const event = transformTracking(raw, 'TESTPKG123')[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['HANDED_IN', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['TERMINAL', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['DEVIATION', 'FAILURE'],
      ['RETURN', 'RETURN_TO_SENDER'],
      ['SOMETHING_ELSE', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeTrackingResponse({
        consignmentSet: [
          {
            consignmentId: 'C1',
            previousConsignmentId: null,
            totalWeightInKgs: null,
            totalVolumeInDm3: null,
            packages: [
              {
                statusDescription: null,
                descriptions: null,
                packageNumber: 'P1',
                dateOfReturn: null,
                dateOfEstimatedDelivery: null,
                eventSet: [makeTrackingEvent({ status })],
              },
            ],
          },
        ],
      })
      expect(transformTracking(raw, 'P1')[0].status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeBookedConsignment()
    const result = transformShipment(raw)

    expect(result.id).toBe('CONS-456')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('PKG-789')
    expect(result.carrierId).toBe('bring')
    expect(result.serviceCode).toBe('SERVICEPAKKE')
    expect(result.labelUrl).toContain('labels/CONS-456.pdf')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeBookedConsignment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeBookedConsignment({
      confirmation: null,
      packages: [],
    })
    const result = transformShipment(raw)

    expect(result.serviceCode).toBeUndefined()
    expect(result.labelUrl).toBeUndefined()
    expect(result.trackingNumber).toBe('CONS-456')
    expect(result.createdAt).toBeUndefined()
  })
})
