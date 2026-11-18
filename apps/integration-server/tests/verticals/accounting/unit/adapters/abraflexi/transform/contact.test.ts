import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type AbraflexiContact } from '../../../../../../../src/verticals/accounting/adapters/abraflexi/transform/contact'

function makeContact(overrides: Partial<AbraflexiContact> = {}): AbraflexiContact {
  return {
    id: '10',
    nazev: 'Firma s.r.o.',
    ic: '12345678',
    email: 'info@firma.cz',
    telefon: '+420123456789',
    ulice: 'Václavské náměstí 1',
    mesto: 'Praha',
    stat: 'CZ',
    psc: '110 00',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeContact({ id: 55 })).id).toBe('55')
  })

  it('maps name from nazev', () => {
    expect(transformContact(makeContact()).name).toBe('Firma s.r.o.')
  })

  it('maps email from email field', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@firma.cz')
  })

  it('maps phone from telefon field', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+420123456789')
  })

  it('maps taxNumber from ic', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('12345678')
  })

  it('maps billing address city from mesto', () => {
    expect(transformContact(makeContact()).billingAddress?.city).toBe('Praha')
  })

  it('maps billing address country from stat', () => {
    expect(transformContact(makeContact()).billingAddress?.country).toBe('CZ')
  })

  it('returns undefined billingAddress when no address fields', () => {
    const result = transformContact(makeContact({ ulice: undefined, mesto: undefined, stat: undefined }))
    expect(result.billingAddress).toBeUndefined()
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
