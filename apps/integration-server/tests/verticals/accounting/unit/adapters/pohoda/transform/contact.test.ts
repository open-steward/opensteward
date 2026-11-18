import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type PohodaContact } from '../../../../../../../src/verticals/accounting/adapters/pohoda/transform/contact'

function makeContact(overrides: Partial<PohodaContact> = {}): PohodaContact {
  return {
    id: '10',
    company: 'Pohoda firma s.r.o.',
    ico: '27074358',
    email: 'kontakt@pohoda.cz',
    phone: '+420123456789',
    street: 'Jinonická 967/88',
    city: 'Praha',
    country: 'CZ',
    zip: '158 00',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeContact({ id: 55 })).id).toBe('55')
  })

  it('maps name from company', () => {
    expect(transformContact(makeContact()).name).toBe('Pohoda firma s.r.o.')
  })

  it('maps email from email field', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('kontakt@pohoda.cz')
  })

  it('maps phone from phone field', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+420123456789')
  })

  it('maps taxNumber from ico', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('27074358')
  })

  it('maps billing address city from city', () => {
    expect(transformContact(makeContact()).billingAddress?.city).toBe('Praha')
  })

  it('maps billing address country from country', () => {
    expect(transformContact(makeContact()).billingAddress?.country).toBe('CZ')
  })

  it('returns undefined emails when no email', () => {
    expect(transformContact(makeContact({ email: undefined })).emails).toBeUndefined()
  })

  it('metadata identity', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact({ id: 55 }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
