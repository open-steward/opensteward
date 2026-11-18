import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type ClickPostRecommendation,
} from '../../../../../../../src/verticals/logistics/adapters/clickpost/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

describe('clickpost transformRate', () => {
  const raw: ClickPostRecommendation = {
    courier_partner_id: 42,
    courier_name: 'Delhivery',
    account_code: 'DEL-SURFACE',
    priority: 1,
    estimated_delivery_days: 3,
    freight_charge: 250,
  }

  it('maps carrierId, serviceCode, serviceName', () => {
    const r = transformRate(raw)
    expect(r.carrierId).toBe('42')
    expect(r.serviceCode).toBe('DEL-SURFACE')
    expect(r.serviceName).toBe('Delhivery')
  })

  it('maps totalAmount, transitDays, deliveryDays', () => {
    const r = transformRate(raw)
    expect(r.totalAmount).toBe(250)
    expect(r.transitDays).toBe(3)
    expect(r.deliveryDays).toBe(3)
  })

  it('uses carrierId as serviceCode fallback when account_code is null', () => {
    const r = transformRate({ ...raw, account_code: null })
    expect(r.serviceCode).toBe('42')
  })

  it('sets carrierId to undefined when courier_partner_id is null', () => {
    const r = transformRate({ ...raw, courier_partner_id: null })
    expect(r.carrierId).toBeUndefined()
  })

  it('sets serviceCode to undefined when both account_code and carrierId are null', () => {
    const r = transformRate({ ...raw, courier_partner_id: null, account_code: null })
    expect(r.serviceCode).toBeUndefined()
  })

  it('sets totalAmount to undefined when freight_charge is null', () => {
    const r = transformRate({ ...raw, freight_charge: null })
    expect(r.totalAmount).toBeUndefined()
  })

  it('sets transitDays and deliveryDays to undefined when estimated_delivery_days is null', () => {
    const r = transformRate({ ...raw, estimated_delivery_days: null })
    expect(r.transitDays).toBeUndefined()
    expect(r.deliveryDays).toBeUndefined()
  })

  it('sets serviceName to undefined when courier_name is null', () => {
    const r = transformRate({ ...raw, courier_name: null })
    expect(r.serviceName).toBeUndefined()
  })

  it('passes RateSchema.parse without throwing', () => {
    expect(() => RateSchema.parse(transformRate(raw))).not.toThrow()
  })
})
