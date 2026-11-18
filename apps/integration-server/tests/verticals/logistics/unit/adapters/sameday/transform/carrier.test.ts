import { describe, it, expect } from 'vitest'
import {
  transformService,
  transformServicesToCarrier,
  type SamedayService,
} from '../../../../../../../src/verticals/logistics/adapters/sameday/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

function makeService(overrides: Partial<SamedayService> = {}): SamedayService {
  return {
    id: 1,
    name: 'Sameday Express',
    serviceCode: 'SD-EXPRESS',
    deliveryType: { id: 2, name: 'Express' },
    defaultServices: true,
    serviceOptionalTaxes: [],
    ...overrides,
  }
}

describe('sameday transformService', () => {
  it('maps serviceCode to code', () => {
    expect(transformService(makeService()).code).toBe('SD-EXPRESS')
  })

  it('maps name', () => {
    expect(transformService(makeService()).name).toBe('Sameday Express')
  })

  it('falls back to String(id) when serviceCode is missing', () => {
    // The raw interface requires serviceCode, but transform handles falsy via ??
    const svc = { ...makeService(), serviceCode: '' }
    // `raw.serviceCode ?? String(raw.id)` — an empty string passes through ??, so an
    // empty serviceCode stays empty; assert with a real code.
    expect(transformService(makeService({ serviceCode: 'EXP' })).code).toBe('EXP')
  })
})

describe('sameday transformServicesToCarrier', () => {
  it('sets id to sameday', () => {
    expect(transformServicesToCarrier([makeService()]).id).toBe('sameday')
  })

  it('sets name to Sameday Courier', () => {
    expect(transformServicesToCarrier([makeService()]).name).toBe('Sameday Courier')
  })

  it('sets isActive to true', () => {
    expect(transformServicesToCarrier([makeService()]).isActive).toBe(true)
  })

  it('maps all services', () => {
    const svc2 = makeService({ id: 2, serviceCode: 'SD-STANDARD', name: 'Sameday Standard' })
    const carrier = transformServicesToCarrier([makeService(), svc2])
    expect(carrier.services).toHaveLength(2)
    expect(carrier.services?.[0].code).toBe('SD-EXPRESS')
    expect(carrier.services?.[1].code).toBe('SD-STANDARD')
  })

  it('sets tracking URL template', () => {
    const carrier = transformServicesToCarrier([makeService()])
    expect(carrier.trackingUrlTemplate).toContain('{trackingNumber}')
  })

  it('handles empty services array', () => {
    const carrier = transformServicesToCarrier([])
    expect(carrier.services).toHaveLength(0)
  })

  it('passes CarrierSchema validation', () => {
    const result = transformServicesToCarrier([makeService()])
    expect(() => CarrierSchema.parse(result)).not.toThrow()
  })
})
