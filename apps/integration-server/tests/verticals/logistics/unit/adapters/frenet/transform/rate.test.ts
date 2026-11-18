import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type FrenetShippingService,
} from '../../../../../../../src/verticals/logistics/adapters/frenet/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeService(overrides: Partial<FrenetShippingService> = {}): FrenetShippingService {
  return {
    ServiceDescription: 'SEDEX',
    Carrier: 'Correios',
    CarrierCode: '04014',
    ShippingPrice: '19.50',
    OriginalShippingPrice: '22.00',
    DeliveryTime: 3,
    DeliveryInBusinessDays: true,
    Home: true,
    Saturday: false,
    Error: null,
    HasError: false,
    ...overrides,
  }
}

describe('frenet transformRate', () => {
  it('maps Carrier as carrierId', () => {
    expect(transformRate(makeService()).carrierId).toBe('Correios')
  })

  it('maps CarrierCode as serviceCode', () => {
    expect(transformRate(makeService()).serviceCode).toBe('04014')
  })

  it('maps ServiceDescription as serviceName', () => {
    expect(transformRate(makeService()).serviceName).toBe('SEDEX')
  })

  it('always sets currency to BRL', () => {
    expect(transformRate(makeService()).currency).toBe('BRL')
  })

  it('maps ShippingPrice as totalAmount (minor units)', () => {
    expect(transformRate(makeService()).totalAmount).toBe(1950)
  })

  it('maps OriginalShippingPrice as retailAmount (minor units)', () => {
    expect(transformRate(makeService()).retailAmount).toBe(2200)
  })

  it('maps DeliveryTime as transitDays and deliveryDays', () => {
    const result = transformRate(makeService())
    expect(result.transitDays).toBe(3)
    expect(result.deliveryDays).toBe(3)
  })

  it('maps Home as isGuaranteedDelivery', () => {
    expect(transformRate(makeService()).isGuaranteedDelivery).toBe(true)
  })

  it('computes estimatedDeliveryAt from createdAt + DeliveryTime days', () => {
    const base = new Date('2024-03-01T00:00:00Z')
    const result = transformRate(makeService(), base)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    const diff = result.estimatedDeliveryAt!.getTime() - base.getTime()
    expect(diff).toBe(3 * 24 * 60 * 60 * 1000)
  })

  it('omits estimatedDeliveryAt when createdAt is absent', () => {
    expect(transformRate(makeService()).estimatedDeliveryAt).toBeUndefined()
  })

  it('handles null ShippingPrice gracefully', () => {
    expect(transformRate(makeService({ ShippingPrice: null })).totalAmount).toBeUndefined()
  })

  it('passes RateSchema validation', () => {
    const base = new Date('2024-03-01T00:00:00Z')
    const result = transformRate(makeService(), base)
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})
