import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type SpeedLedgerContact,
} from '../../../../../../../src/verticals/accounting/adapters/speedledger/transform/contact'

function makeContact(overrides: Partial<SpeedLedgerContact> = {}): SpeedLedgerContact {
  return {
    id: 77,
    name: 'Teknik AB',
    email: 'info@teknik.se',
    phone: '+46701112233',
    address: 'Industrigatan 8',
    city: 'Göteborg',
    postalCode: '411 02',
    country: 'SE',
    orgNumber: '556555-1234',
    isCustomer: true,
    isSupplier: false,
    ...overrides,
  }
}

describe('transformContact (SpeedLedger)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('77')
    expect(result.name).toBe('Teknik AB')
    expect(result.identification).toBe('556555-1234')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.isActive).toBe(true)
  })

  it('maps email to emails array', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@teknik.se')
  })

  it('maps address fields', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('Industrigatan 8')
    expect(result.billingAddress?.city).toBe('Göteborg')
    expect(result.billingAddress?.postalCode).toBe('411 02')
    expect(result.billingAddress?.country).toBe('SE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('defaults isCustomer to true when not provided', () => {
    const raw = makeContact()
    delete (raw as Partial<SpeedLedgerContact>).isCustomer
    expect(transformContact(raw).isCustomer).toBe(true)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
