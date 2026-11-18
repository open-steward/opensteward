import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type DeliverectValidation,
} from '../../../../../../../src/verticals/logistics/adapters/deliverect/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeValidation(o: Partial<DeliverectValidation> = {}): DeliverectValidation {
  return {
    available: true,
    validationId: 'val-abc-123',
    price: 599,
    currency: 'USD',
    ETAs: {
      pickupTime: '2024-03-01T10:00:00Z',
      deliveryTime: '2024-03-01T10:30:00Z',
    },
    courierName: 'Stuart',
    ...o,
  }
}

describe('deliverect transformRate', () => {
  it('maps validationId to id', () => {
    const result = transformRate(makeValidation())
    expect(result.id).toBe('val-abc-123')
  })

  it('maps carrierId to deliverect', () => {
    const result = transformRate(makeValidation())
    expect(result.carrierId).toBe('deliverect')
  })

  it('maps serviceCode to deliverect_dispatch', () => {
    const result = transformRate(makeValidation())
    expect(result.serviceCode).toBe('deliverect_dispatch')
  })

  it('maps courierName to serviceName', () => {
    const result = transformRate(makeValidation())
    expect(result.serviceName).toBe('Stuart')
  })

  it('defaults serviceName to Deliverect Dispatch when courierName is absent', () => {
    const result = transformRate(makeValidation({ courierName: null }))
    expect(result.serviceName).toBe('Deliverect Dispatch')
  })

  it('maps price to totalAmount', () => {
    const result = transformRate(makeValidation())
    expect(result.totalAmount).toBe(599)
  })

  it('sets totalAmount to undefined when price is null', () => {
    const result = transformRate(makeValidation({ price: null }))
    expect(result.totalAmount).toBeUndefined()
  })

  it('maps currency', () => {
    const result = transformRate(makeValidation())
    expect(result.currency).toBe('USD')
  })

  it('maps ETAs.deliveryTime to estimatedDeliveryAt', () => {
    const result = transformRate(makeValidation())
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps ETAs.delivery_time as fallback for estimatedDeliveryAt', () => {
    const result = transformRate(
      makeValidation({
        ETAs: { delivery_time: '2024-03-01T11:00:00Z' },
      }),
    )
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('sets estimatedDeliveryAt to undefined when ETAs is null', () => {
    const result = transformRate(makeValidation({ ETAs: null }))
    expect(result.estimatedDeliveryAt).toBeUndefined()
  })

  it('passes RateSchema validation', () => {
    const result = transformRate(makeValidation())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })

  it('passes RateSchema validation with minimal input', () => {
    const result = transformRate({})
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})
