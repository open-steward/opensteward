import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type PochtaRussiaTariffResponse,
} from '../../../../../../../src/verticals/logistics/adapters/pochta-russia/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

describe('transformRate', () => {
  it('maps id and name', () => {
    const raw: PochtaRussiaTariffResponse = {
      id: 47030,
      name: 'Посылка первого класса',
      ground: { val: 50000, vat: 8000 },
    }
    const result = transformRate(raw)
    expect(result.id).toBe('47030')
    expect(result.serviceName).toBe('Посылка первого класса')
  })

  it('prefers ground.val over air.val for totalAmount', () => {
    const raw: PochtaRussiaTariffResponse = {
      ground: { val: 50000 },
      air: { val: 70000 },
    }
    const result = transformRate(raw)
    expect(result.totalAmount).toBe(50000)
  })

  it('falls back to air.val when ground is absent', () => {
    const raw: PochtaRussiaTariffResponse = {
      air: { val: 70000 },
    }
    const result = transformRate(raw)
    expect(result.totalAmount).toBe(70000)
  })

  it('computes transitDays as ceil of average of min/max', () => {
    const raw: PochtaRussiaTariffResponse = {
      delivery: { min: 3, max: 7 },
    }
    const result = transformRate(raw)
    // ceil((3+7)/2) = 5
    expect(result.transitDays).toBe(5)
    expect(result.deliveryDays).toBe(7)
  })

  it('sets currency to RUB', () => {
    expect(transformRate({}).currency).toBe('RUB')
  })

  it('sets carrierId to pochta-russia', () => {
    expect(transformRate({}).carrierId).toBe('pochta-russia')
  })

  it('parses estimatedDeliveryAt from date string', () => {
    const raw: PochtaRussiaTariffResponse = { date: '2024-03-01T00:00:00Z' }
    const result = transformRate(raw)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes schema parse', () => {
    const raw: PochtaRussiaTariffResponse = {
      id: 47060,
      name: 'Посылка онлайн',
      ground: { val: 35000, vat: 5800 },
      delivery: { min: 2, max: 5 },
      date: '2024-03-01T00:00:00Z',
    }
    const result = transformRate(raw)
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})
