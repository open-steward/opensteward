import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type ICountContact } from '../../../../../../../src/verticals/accounting/adapters/icount/transform/contact'

function makeContact(overrides: Partial<ICountContact> = {}): ICountContact {
  return {
    client_id: 'clt_5',
    client_name: 'Tech Solutions Ltd',
    type: 'business',
    email: 'info@techsol.il',
    phone: '03-5556666',
    address: 'HaHashmonaim 25',
    city: 'Tel Aviv',
    country: 'IL',
    tax_id: '512345678',
    ...overrides,
  }
}

describe('transformContact (icount)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('clt_5')
    expect(result.name).toBe('Tech Solutions Ltd')
    expect(result.identification).toBe('512345678')
    expect(result.isCustomer).toBe(true)
  })

  it('maps email correctly', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@techsol.il')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone correctly', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('03-5556666')
  })

  it('maps address correctly', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('HaHashmonaim 25')
    expect(result.billingAddress?.city).toBe('Tel Aviv')
    expect(result.billingAddress?.country).toBe('IL')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles missing email', () => {
    const result = transformContact(makeContact({ email: undefined }))
    expect(result.emails).toBeUndefined()
  })

  it('handles missing phone', () => {
    const result = transformContact(makeContact({ phone: undefined }))
    expect(result.telephones).toBeUndefined()
  })

  it('handles missing address fields', () => {
    const result = transformContact(makeContact({ address: undefined, city: undefined, country: undefined }))
    expect(result.billingAddress).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
