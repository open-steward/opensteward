import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type ComarchoptimaContact } from '../../../../../../../src/verticals/accounting/adapters/comarchoptima/transform/contact'

function makeContact(overrides: Partial<ComarchoptimaContact> = {}): ComarchoptimaContact {
  return {
    id: '10',
    kod: 'K001',
    nazwa: 'Firma Sp. z o.o.',
    email: 'kontakt@firma.pl',
    telefon: '+48123456789',
    nip: '1234567890',
    ulica: 'ul. Warszawska 1',
    miasto: 'Warszawa',
    kraj: 'PL',
    kod_pocztowy: '00-001',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeContact({ id: 55 })).id).toBe('55')
  })

  it('maps name from nazwa', () => {
    expect(transformContact(makeContact()).name).toBe('Firma Sp. z o.o.')
  })

  it('maps email from email field', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('kontakt@firma.pl')
  })

  it('maps phone from telefon field', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+48123456789')
  })

  it('maps taxNumber from nip', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('1234567890')
  })

  it('maps billing address from address fields', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.city).toBe('Warszawa')
    expect(result.billingAddress?.country).toBe('PL')
    expect(result.billingAddress?.address1).toBe('ul. Warszawska 1')
    expect(result.billingAddress?.postalCode).toBe('00-001')
  })

  it('returns undefined billingAddress when no address fields', () => {
    const result = transformContact(makeContact({ ulica: undefined, miasto: undefined, kraj: undefined }))
    expect(result.billingAddress).toBeUndefined()
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
