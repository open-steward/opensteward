import { describe, it, expect } from 'vitest'
import {
  transformRoute,
  type NBRoute,
} from '../../../../../../../src/verticals/logistics/adapters/nextbillion-ai/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeRoute(overrides: Partial<NBRoute> = {}): NBRoute {
  return {
    id: 'route-001',
    short_id: 'R001',
    status: 'in_progress',
    distance: 35000,
    routing: 'car',
    driver: {
      id: 'driver-42',
      fullname: 'Jane Driver',
      email: 'jane@example.com',
    },
    total_steps: 3,
    completed_steps: 1,
    steps: [
      {
        id: 'step-start',
        type: 'start',
        arrival: '2024-03-01T08:00:00Z',
        address: '1 Depot Lane, Chicago, IL',
        location: { lat: 41.8781, lng: -87.6298 },
      },
      {
        id: 'step-job',
        type: 'job',
        arrival: '2024-03-01T10:00:00Z',
        address: '9 Customer Ave, Evanston, IL',
        location: { lat: 42.0451, lng: -87.6877 },
        completion: {
          status: 'pending',
          note: null,
          timestamp: null,
        },
      },
    ],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T08:30:00Z',
    ...overrides,
  }
}

describe('nextbillion-ai transformRoute', () => {
  it('maps id from route id', () => {
    expect(transformRoute(makeRoute()).id).toBe('route-001')
  })

  it('maps reference from short_id', () => {
    expect(transformRoute(makeRoute()).reference).toBe('R001')
  })

  it('maps status "in_progress" → IN_TRANSIT', () => {
    expect(transformRoute(makeRoute()).status).toBe('IN_TRANSIT')
  })

  it('maps status "completed" → DELIVERED', () => {
    expect(transformRoute(makeRoute({ status: 'completed' })).status).toBe('DELIVERED')
  })

  it('maps status "dispatched" → LABEL_CREATED', () => {
    expect(transformRoute(makeRoute({ status: 'dispatched' })).status).toBe('LABEL_CREATED')
  })

  it('maps status "cancelled" → CANCELLED', () => {
    expect(transformRoute(makeRoute({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status "failed" → EXCEPTION', () => {
    expect(transformRoute(makeRoute({ status: 'failed' })).status).toBe('EXCEPTION')
  })

  it('maps unknown status → UNKNOWN', () => {
    expect(transformRoute(makeRoute({ status: 'mystery' })).status).toBe('UNKNOWN')
  })

  it('maps carrierId from driver.id', () => {
    expect(transformRoute(makeRoute()).carrierId).toBe('driver-42')
  })

  it('omits carrierId when driver is null', () => {
    expect(transformRoute(makeRoute({ driver: null })).carrierId).toBeUndefined()
  })

  it('maps serviceCode from routing', () => {
    expect(transformRoute(makeRoute()).serviceCode).toBe('car')
  })

  it('maps originAddress from start step address', () => {
    expect(transformRoute(makeRoute()).originAddress?.street1).toBe('1 Depot Lane, Chicago, IL')
  })

  it('maps destinationAddress from first job step address', () => {
    expect(transformRoute(makeRoute()).destinationAddress?.street1).toBe(
      '9 Customer Ave, Evanston, IL',
    )
  })

  it('maps estimatedDeliveryAt from destination step arrival', () => {
    expect(transformRoute(makeRoute()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps actualDeliveryAt from completion.timestamp when status is completed', () => {
    const route = makeRoute({
      status: 'completed',
      steps: [
        { id: 'step-start', type: 'start', arrival: '2024-03-01T08:00:00Z', address: '1 Depot' },
        {
          id: 'step-job',
          type: 'job',
          arrival: '2024-03-01T10:00:00Z',
          address: '9 Customer Ave',
          completion: { status: 'completed', note: null, timestamp: '2024-03-01T11:30:00Z' },
        },
      ],
    })
    expect(transformRoute(route).actualDeliveryAt).toBeInstanceOf(Date)
  })

  it('omits actualDeliveryAt when status is not completed', () => {
    expect(transformRoute(makeRoute()).actualDeliveryAt).toBeUndefined()
  })

  it('maps createdAt and updatedAt as Dates', () => {
    const result = transformRoute(makeRoute())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    expect(() => ShipmentSchema.parse(transformRoute(makeRoute()))).not.toThrow()
  })
})
