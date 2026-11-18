import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type InsertnexoContact } from '../../../../../../../src/verticals/accounting/adapters/insertnexo/transform/contact'

function makeContact(overrides: Partial<InsertnexoContact> = {}): InsertnexoContact {
  return {
    Id: '10',
    Nazwa: 'Firma Sp. z o.o.',
    Email: 'kontakt@firma.pl',
    Telefon: '+48123456789',
    NIP: '1234567890',
    Ulica: 'ul. Krakowska 5',
    Miasto: 'Kraków',
    Kraj: 'PL',
    KodPocztowy: '30-001',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps Id to string id', () => {
    expect(transformContact(makeContact({ Id: 55 })).id).toBe('55')
  })

  it('maps name from Nazwa', () => {
    expect(transformContact(makeContact()).name).toBe('Firma Sp. z o.o.')
  })

  it('maps email from Email field', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('kontakt@firma.pl')
  })

  it('maps phone from Telefon field', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+48123456789')
  })

  it('maps taxNumber from NIP', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('1234567890')
  })

  it('maps billing address city from Miasto', () => {
    expect(transformContact(makeContact()).billingAddress?.city).toBe('Kraków')
  })

  it('maps billing address country from Kraj', () => {
    expect(transformContact(makeContact()).billingAddress?.country).toBe('PL')
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
