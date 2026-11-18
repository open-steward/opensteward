import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type WisoContact } from '../../../../../../../src/verticals/accounting/adapters/wisomeinbuero/transform/contact'

function makeContact(overrides: Partial<WisoContact> = {}): WisoContact {
  return {
    id: 'cust-1',
    name: 'Mustermann GmbH',
    email: 'info@mustermann.de',
    phone: '+49 89 123456',
    street: 'Musterstraße 1',
    city: 'München',
    zipCode: '80331',
    country: 'DE',
    vatId: 'DE123456789',
    isCustomer: true,
    isSupplier: false,
    isActive: true,
    ...overrides,
  }
}

describe('transformContact (WISO MeinBüro)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('cust-1')
    expect(result.name).toBe('Mustermann GmbH')
    expect(result.identification).toBe('DE123456789')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.isActive).toBe(true)
  })

  it('maps email', () => {
    expect(transformContact(makeContact()).emails?.[0]?.email).toBe('info@mustermann.de')
  })

  it('maps phone', () => {
    expect(transformContact(makeContact()).telephones?.[0]?.telephone).toBe('+49 89 123456')
  })

  it('maps address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.city).toBe('München')
    expect(result.billingAddress?.country).toBe('DE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
