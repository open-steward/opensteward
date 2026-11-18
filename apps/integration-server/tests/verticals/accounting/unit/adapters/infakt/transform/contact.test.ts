import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type InfaktClient,
} from '../../../../../../../src/verticals/accounting/adapters/infakt/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeContact(overrides: Partial<InfaktClient> = {}): InfaktClient {
  return {
    id: 7,
    company_name: 'Widget Corp',
    first_name: 'Anna',
    last_name: 'Nowak',
    nip: '222-111-44-55',
    email: 'anna@widgetcorp.pl',
    phone_number: '+48 500 111 222',
    street: 'ul. Kwiatowa',
    street_number: '5',
    flat_number: '3A',
    city: 'Kraków',
    postal_code: '30-001',
    country: 'PL',
    web_site: 'https://widgetcorp.pl',
    payment_method: 'transfer',
    note: 'Key customer',
    ...overrides,
  }
}

describe('transformContact (infakt)', () => {
  it('maps numeric id to string', () => {
    expect(transformContact(makeContact()).id).toBe('7')
  })

  it('composes name from company_name when set', () => {
    expect(transformContact(makeContact()).name).toBe('Widget Corp')
  })

  it('composes name from first_name + last_name when company_name is null', () => {
    const result = transformContact(makeContact({ company_name: null }))
    expect(result.name).toBe('Anna Nowak')
  })

  it('maps company_name to companyName', () => {
    expect(transformContact(makeContact()).companyName).toBe('Widget Corp')
  })

  it('maps first_name and last_name', () => {
    const result = transformContact(makeContact())
    expect(result.firstName).toBe('Anna')
    expect(result.lastName).toBe('Nowak')
  })

  it('maps nip to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('222-111-44-55')
  })

  it('isCustomer is always true', () => {
    expect(transformContact(makeContact()).isCustomer).toBe(true)
  })

  it('isSupplier is always false', () => {
    expect(transformContact(makeContact()).isSupplier).toBe(false)
  })

  it('composes address1 from street + street_number', () => {
    expect(transformContact(makeContact()).billingAddress?.address1).toBe('ul. Kwiatowa 5')
  })

  it('builds address2 with flat_number prefixed by Apt', () => {
    expect(transformContact(makeContact()).billingAddress?.address2).toBe('Apt 3A')
  })

  it('omits address2 when flat_number is null', () => {
    expect(
      transformContact(makeContact({ flat_number: null })).billingAddress?.address2,
    ).toBeUndefined()
  })

  it('maps city, postal_code, country to address', () => {
    const addr = transformContact(makeContact()).billingAddress
    expect(addr?.city).toBe('Kraków')
    expect(addr?.postalCode).toBe('30-001')
    expect(addr?.country).toBe('PL')
  })

  it('maps email to emails array', () => {
    const emails = transformContact(makeContact()).emails
    expect(emails?.[0]?.email).toBe('anna@widgetcorp.pl')
  })

  it('maps phone_number to telephones with WORK type', () => {
    const tels = transformContact(makeContact()).telephones
    expect(tels?.[0]?.telephone).toBe('+48 500 111 222')
    expect(tels?.[0]?.type).toBe('WORK')
  })

  it('produces a schema-valid Contact', () => {
    expect(() => ContactSchema.parse(transformContact(makeContact()))).not.toThrow()
  })

  describe('untransformContact', () => {
    it('defaults country to PL when not set', () => {
      const body = untransformContact({ companyName: 'Test' })
      expect(body['country']).toBe('PL')
    })

    it('maps companyName to company_name', () => {
      const body = untransformContact({ companyName: 'Widget Corp' })
      expect(body['company_name']).toBe('Widget Corp')
    })

    it('maps taxNumber to nip', () => {
      const body = untransformContact({ taxNumber: '111-222-33-44' })
      expect(body['nip']).toBe('111-222-33-44')
    })
  })
})
