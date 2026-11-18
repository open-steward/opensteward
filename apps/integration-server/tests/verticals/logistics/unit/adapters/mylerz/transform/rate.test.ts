import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type MylerzRateRaw,
} from '../../../../../../../src/verticals/logistics/adapters/mylerz/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRate(overrides: Partial<MylerzRateRaw> = {}): MylerzRateRaw {
  return {
    TransferValue: 80,
    ShippingFees: 50,
    Charges: 5,
    FulfillmentFees: 10,
    VAT: 5,
    TotalTransfer: 100,
    ServiceCode: 'EXPRESS_DELIVERY',
    ...overrides,
  }
}

describe('transformRate (mylerz)', () => {
  it('maps carrierId to "mylerz"', () => {
    expect(transformRate(makeRate()).carrierId).toBe('mylerz')
  })

  it('maps serviceCode from ServiceCode', () => {
    expect(transformRate(makeRate()).serviceCode).toBe('EXPRESS_DELIVERY')
  })

  it('maps serviceCode from service_code when ServiceCode absent', () => {
    expect(
      transformRate(makeRate({ ServiceCode: null, service_code: 'STANDARD' })).serviceCode,
    ).toBe('STANDARD')
  })

  it('defaults serviceCode to "mylerz_standard" when both absent', () => {
    expect(transformRate(makeRate({ ServiceCode: null, service_code: null })).serviceCode).toBe(
      'mylerz_standard',
    )
  })

  it('maps serviceName to "Mylerz Delivery"', () => {
    expect(transformRate(makeRate()).serviceName).toBe('Mylerz Delivery')
  })

  it('maps currency to "EGP"', () => {
    expect(transformRate(makeRate()).currency).toBe('EGP')
  })

  it('maps totalAmount from TotalTransfer preferentially', () => {
    expect(transformRate(makeRate()).totalAmount).toBe(100)
  })

  it('falls back to ShippingFees when TotalTransfer absent', () => {
    expect(transformRate(makeRate({ TotalTransfer: null })).totalAmount).toBe(50)
  })

  it('maps retailAmount from TransferValue', () => {
    expect(transformRate(makeRate()).retailAmount).toBe(80)
  })

  it('passes through metadata as the raw object', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('produces a RateSchema-valid result', () => {
    expect(() => RateSchema.parse(transformRate(makeRate()))).not.toThrow()
  })
})
