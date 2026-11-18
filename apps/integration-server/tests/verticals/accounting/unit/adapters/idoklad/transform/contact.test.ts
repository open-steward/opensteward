import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type IdokladContact } from '../../../../../../../src/verticals/accounting/adapters/idoklad/transform/contact'

function makeContact(overrides: Partial<IdokladContact> = {}): IdokladContact {
  return {
    Id: '10',
    CompanyName: 'iDoklad s.r.o.',
    TaxNumber: 'CZ27074358',
    Email: 'info@idoklad.cz',
    Phone: '+420800100301',
    Street: 'Palackého třída 163',
    City: 'Brno',
    Country: 'CZ',
    PostalCode: '612 00',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps Id to string id', () => {
    expect(transformContact(makeContact({ Id: 55 })).id).toBe('55')
  })

  it('maps name from CompanyName', () => {
    expect(transformContact(makeContact()).name).toBe('iDoklad s.r.o.')
  })

  it('maps email from Email field', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@idoklad.cz')
  })

  it('maps phone from Phone field', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+420800100301')
  })

  it('maps taxNumber from TaxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('CZ27074358')
  })

  it('maps billing address city from City', () => {
    expect(transformContact(makeContact()).billingAddress?.city).toBe('Brno')
  })

  it('maps billing address country from Country', () => {
    expect(transformContact(makeContact()).billingAddress?.country).toBe('CZ')
  })

  it('returns undefined emails when no Email', () => {
    expect(transformContact(makeContact({ Email: undefined })).emails).toBeUndefined()
  })

  it('metadata identity', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact({ Id: 55 }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
