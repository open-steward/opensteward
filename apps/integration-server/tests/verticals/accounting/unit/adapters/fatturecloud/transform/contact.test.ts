import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type FattureCloudClient } from '../../../../../../../src/verticals/accounting/adapters/fatturecloud/transform/contact'

function makeClient(overrides: Partial<FattureCloudClient> = {}): FattureCloudClient {
  return { id: 1, name: 'Cliente SPA', email: 'info@cliente.it', phone: '+3902000', type: 'company', ...overrides }
}

describe('transformContact (fatturecloud)', () => {
  it('maps id to string', () => { expect(transformContact(makeClient()).id).toBe('1') })
  it('maps name', () => { expect(transformContact(makeClient()).name).toBe('Cliente SPA') })
  it('maps email', () => { expect(transformContact(makeClient()).emails?.[0]?.email).toBe('info@cliente.it') })
  it('maps phone', () => { expect(transformContact(makeClient()).telephones?.[0]?.telephone).toBe('+3902000') })
  it('sets isCustomer true', () => { expect(transformContact(makeClient()).isCustomer).toBe(true) })
  it('maps billing address', () => {
    const r = transformContact(makeClient({ address_street: 'Via Garibaldi 5', address_city: 'Roma', address_country: 'IT' }))
    expect(r.billingAddress?.city).toBe('Roma')
  })
  it('passes raw as metadata', () => {
    const raw = makeClient()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeClient())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
