import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type AlegraContact } from '../../../../../../../src/verticals/accounting/adapters/alegra/transform/contact'

function makeContact(overrides: Partial<AlegraContact> = {}): AlegraContact {
  return {
    id: 5,
    name: 'Empresa ABC',
    identification: '900123456-1',
    email: 'contact@abc.co',
    phonePrimary: '601-1234567',
    phoneSecondary: '',
    mobile: '3001234567',
    type: ['client'],
    status: 'active',
    address: 'Calle 10 #5-20',
    city: 'Bogotá',
    department: 'Cundinamarca',
    country: 'CO',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeContact()).id).toBe('5')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Empresa ABC')
  })

  it('maps identification', () => {
    expect(transformContact(makeContact()).identification).toBe('900123456-1')
  })

  it('sets isCustomer=true when type includes client', () => {
    expect(transformContact(makeContact({ type: ['client'] })).isCustomer).toBe(true)
  })

  it('sets isSupplier=true when type includes provider', () => {
    expect(transformContact(makeContact({ type: ['provider'] })).isSupplier).toBe(true)
  })

  it('sets isActive=true when status is active', () => {
    expect(transformContact(makeContact({ status: 'active' })).isActive).toBe(true)
  })

  it('sets isActive=false when status is inactive', () => {
    expect(transformContact(makeContact({ status: 'inactive' })).isActive).toBe(false)
  })

  it('maps email', () => {
    const c = transformContact(makeContact())
    expect(c.emails?.[0]).toEqual({ email: 'contact@abc.co', type: 'WORK' })
  })

  it('maps phonePrimary as WORK telephone', () => {
    const c = transformContact(makeContact())
    expect(c.telephones?.[0]).toEqual({ telephone: '601-1234567', type: 'WORK' })
  })

  it('maps mobile as MOBILE telephone', () => {
    const c = transformContact(makeContact())
    const mobile = c.telephones?.find((t) => t.type === 'MOBILE')
    expect(mobile?.telephone).toBe('3001234567')
  })

  it('maps billing address', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('Calle 10 #5-20')
    expect(c.billingAddress?.city).toBe('Bogotá')
    expect(c.billingAddress?.country).toBe('CO')
  })

  it('passes raw object as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
