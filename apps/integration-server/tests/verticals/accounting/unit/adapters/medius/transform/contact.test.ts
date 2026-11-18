import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type MediusSupplier,
} from '../../../../../../../src/verticals/accounting/adapters/medius/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeSupplier(overrides: Partial<MediusSupplier> = {}): MediusSupplier {
  return {
    name: 'Acme Supplies Ltd',
    supplierId: 'sup_001',
    currencyCode: 'EUR',
    email: 'ap@acme.example',
    telephone: '+14155550100',
    streetAddress: '123 Main St',
    zip: '94105',
    city: 'San Francisco',
    country: 'US',
    state: 'CA',
    ...overrides,
  }
}

describe('transformSupplier (medius)', () => {
  it('maps supplierId to id', () => {
    expect(transformSupplier(makeSupplier()).id).toBe('sup_001')
  })

  it('falls back to mediusFlowSystemId when supplierId is absent', () => {
    const result = transformSupplier(
      makeSupplier({ supplierId: undefined, mediusFlowSystemId: 'mf_99' }),
    )
    expect(result.id).toBe('mf_99')
  })

  it('maps name to both name and companyName', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.name).toBe('Acme Supplies Ltd')
    expect(result.companyName).toBe('Acme Supplies Ltd')
  })

  it('maps currencyCode to currency', () => {
    expect(transformSupplier(makeSupplier()).currency).toBe('EUR')
  })

  it('sets isSupplier=true and isCustomer=false', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.isSupplier).toBe(true)
    expect(result.isCustomer).toBe(false)
  })

  it('maps email as WORK type', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.emails).toEqual([{ email: 'ap@acme.example', type: 'WORK' }])
  })

  it('produces no emails when email is absent', () => {
    expect(transformSupplier(makeSupplier({ email: undefined })).emails).toBeUndefined()
  })

  it('maps telephone as WORK type', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.telephones).toEqual([{ telephone: '+14155550100', type: 'WORK' }])
  })

  it('maps billing address fields', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.billingAddress?.address1).toBe('123 Main St')
    expect(result.billingAddress?.city).toBe('San Francisco')
    expect(result.billingAddress?.postalCode).toBe('94105')
    expect(result.billingAddress?.country).toBe('US')
    expect(result.billingAddress?.region).toBe('CA')
  })

  it('returns no billingAddress when all address fields are absent', () => {
    const result = transformSupplier(
      makeSupplier({
        streetAddress: undefined,
        city: undefined,
        zip: undefined,
        country: undefined,
      }),
    )
    expect(result.billingAddress).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeSupplier()
    expect(transformSupplier(raw).metadata).toBe(raw)
  })

  it('passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformSupplier(makeSupplier()))).not.toThrow()
  })
})
