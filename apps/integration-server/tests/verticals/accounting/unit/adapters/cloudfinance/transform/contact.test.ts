import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type CloudFinanceContact } from '../../../../../../../src/verticals/accounting/adapters/cloudfinance/transform/contact'

function makeContact(overrides: Partial<CloudFinanceContact> = {}): CloudFinanceContact {
  return {
    id: 'C-001',
    name: 'Test Srl', vat_number: 'IT01234567890', fiscal_code: 'TST', email: 'info@test.it', phone: '+39', address: 'Via Roma 1', city: 'Milano', postal_code: '20100', province: 'MI', country: 'IT', currency: 'EUR', active: true, type: 'customer',
    ...overrides,
  }
}

describe('transformContact (cloudfinance)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('C-001')
  })

  it('maps email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toBeDefined()
    expect(result.emails![0]?.email).toBe('info@test.it')
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress).toBeDefined()
    expect(result.billingAddress?.city).toBe('Milano')
  })

  it('passes raw as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
