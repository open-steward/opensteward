import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type LogoContact } from '../../../../../../../src/verticals/accounting/adapters/logoyazilim/transform/contact'

function makeContact(overrides: Partial<LogoContact> = {}): LogoContact {
  return {
    id: '200',
    Name: 'Yıldız Tekstil A.Ş.',
    Type: 'Customer',
    Email: 'info@yildiz.com.tr',
    Phone: '+90-312-555-0000',
    Address: 'Atatürk Caddesi No:1',
    City: 'Ankara',
    Country: 'TR',
    TaxId: '9876543210',
    ...overrides,
  }
}

describe('transformContact (logoyazilim)', () => {
  it('maps id correctly', () => {
    expect(transformContact(makeContact()).id).toBe('200')
  })

  it('maps name correctly', () => {
    expect(transformContact(makeContact()).name).toBe('Yıldız Tekstil A.Ş.')
  })

  it('maps taxNumber from TaxId', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('9876543210')
  })

  it('sets isCustomer=true and isSupplier=false for Customer type', () => {
    const c = transformContact(makeContact({ Type: 'Customer' }))
    expect(c.isCustomer).toBe(true)
    expect(c.isSupplier).toBe(false)
  })

  it('sets isSupplier=true and isCustomer=false for Supplier type', () => {
    const c = transformContact(makeContact({ Type: 'Supplier' }))
    expect(c.isSupplier).toBe(true)
    expect(c.isCustomer).toBe(false)
  })

  it('maps email', () => {
    expect(transformContact(makeContact()).emails?.[0]).toEqual({ email: 'info@yildiz.com.tr', type: 'WORK' })
  })

  it('maps phone', () => {
    expect(transformContact(makeContact()).telephones?.[0]).toEqual({ telephone: '+90-312-555-0000', type: 'WORK' })
  })

  it('maps billing address', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('Atatürk Caddesi No:1')
    expect(c.billingAddress?.city).toBe('Ankara')
    expect(c.billingAddress?.country).toBe('TR')
  })

  it('passes raw object as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw: LogoContact = { id: '999' }
    const c = transformContact(raw)
    expect(c.id).toBe('999')
    expect(c.name).toBeUndefined()
    expect(c.emails).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
