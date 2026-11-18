import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type SFTrackingResponse,
  type SFRouteInfo,
} from '../../../../../src/verticals/logistics/adapters/sf-express/transform/tracking'
import { sign } from '../../../../../src/verticals/logistics/adapters/sf-express/auth'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeRouteInfo(overrides: Partial<SFRouteInfo> = {}): SFRouteInfo {
  return {
    opCode: '30',
    remark: 'Shipment in transit',
    acceptTime: '2024-03-15 10:30:00',
    acceptAddress: 'Shenzhen Distribution Center',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<SFTrackingResponse> = {}): SFTrackingResponse {
  return {
    routeResps: [
      {
        mailNo: 'SF1234567890',
        routes: [
          makeRouteInfo({ opCode: '50', remark: 'Shipment collected', acceptAddress: 'Guangzhou' }),
          makeRouteInfo(),
        ],
      },
    ],
    ...overrides,
  }
}

// ─── sign ───────────────────────────────────────────────────────────────────

describe('sign', () => {
  it('produces a non-empty base64 string', () => {
    const result = sign('{"test":"data"}', 1710500000, 'checkword123')
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
    // Base64 pattern
    expect(result).toMatch(/^[A-Za-z0-9+/]+=*$/)
  })

  it('produces different signatures for different data', () => {
    const sig1 = sign('data1', 1710500000, 'key')
    const sig2 = sign('data2', 1710500000, 'key')
    expect(sig1).not.toBe(sig2)
  })

  it('produces different signatures for different timestamps', () => {
    const sig1 = sign('data', 1710500000, 'key')
    const sig2 = sign('data', 1710500001, 'key')
    expect(sig1).not.toBe(sig2)
  })

  it('produces consistent results for same inputs', () => {
    const sig1 = sign('data', 1710500000, 'key')
    const sig2 = sign('data', 1710500000, 'key')
    expect(sig1).toBe(sig2)
  })
})

// ─── transformTracking ──────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces events from all route responses', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw, 'SF1234567890')
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw, 'SF1234567890')[0]

    expect(event.trackingNumber).toBe('SF1234567890')
    expect(event.carrierId).toBe('sf-express')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Shipment collected')
    expect(event.location?.city).toBe('Guangzhou')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw, 'SF1234567890')
    events.forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a single fallback event when no routes exist', () => {
    const raw = makeTrackingResponse({
      routeResps: [
        { mailNo: 'SF1234567890', routes: [] },
      ],
    })
    const events = transformTracking(raw, 'SF1234567890')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('SF1234567890')
  })

  it('handles null acceptAddress gracefully', () => {
    const raw = makeTrackingResponse({
      routeResps: [
        {
          mailNo: 'SF1234567890',
          routes: [makeRouteInfo({ acceptAddress: null })],
        },
      ],
    })
    const event = transformTracking(raw, 'SF1234567890')[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['50', 'PRE_TRANSIT'],
      ['30', 'IN_TRANSIT'],
      ['44', 'OUT_FOR_DELIVERY'],
      ['80', 'DELIVERED'],
      ['70', 'FAILURE'],
      ['31', 'RETURN_TO_SENDER'],
      ['99', 'UNKNOWN'],
    ]
    for (const [opCode, expected] of cases) {
      const raw = makeTrackingResponse({
        routeResps: [
          {
            mailNo: 'SF1234567890',
            routes: [makeRouteInfo({ opCode })],
          },
        ],
      })
      expect(transformTracking(raw, 'SF1234567890')[0].status).toBe(expected)
    }
  })
})
