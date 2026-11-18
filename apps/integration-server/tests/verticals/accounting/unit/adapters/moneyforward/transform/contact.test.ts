import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type MoneyForwardPartner } from '../../../../../../../src/verticals/accounting/adapters/moneyforward/transform/contact'

function makeRaw(overrides: Partial<MoneyForwardPartner> = {}): MoneyForwardPartner {
  return {
    id: 'partner-123',
    name: 'Tanaka Trading Co',
    code: 'TTC',
    email: 'info@tanaka.jp',
    phone: '06-1234-5678',
    zip: '530-0001',
    prefecture_code: '27',
    address1: '1-1 Umeda',
    address2: 'Floor 5',
    ...overrides,
  }
}

describe('transformContact (moneyforward)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeRaw())
    expect(result.id).toBe('partner-123')
    expect(result.name).toBe('Tanaka Trading Co')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps email to work email', () => {
    const result = transformContact(makeRaw())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@tanaka.jp')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to work telephone', () => {
    const result = transformContact(makeRaw())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('06-1234-5678')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('maps address fields to billing address', () => {
    const result = transformContact(makeRaw())
    expect(result.billingAddress?.address1).toBe('1-1 Umeda')
    expect(result.billingAddress?.address2).toBe('Floor 5')
    expect(result.billingAddress?.postalCode).toBe('530-0001')
  })

  it('returns undefined emails when email is null', () => {
    const result = transformContact(makeRaw({ email: null }))
    expect(result.emails).toBeUndefined()
  })

  it('returns undefined telephones when phone is null', () => {
    const result = transformContact(makeRaw({ phone: null }))
    expect(result.telephones).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
