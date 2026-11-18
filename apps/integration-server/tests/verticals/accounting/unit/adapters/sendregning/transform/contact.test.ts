import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type SendRegningContact,
} from '../../../../../../../src/verticals/accounting/adapters/sendregning/transform/contact'

function makeContact(overrides: Partial<SendRegningContact> = {}): SendRegningContact {
  return {
    id: 'c-1',
    name: 'Test AS',
    email: 'test@test.no',
    orgNo: '123456789',
    isRecipient: true,
    ...overrides,
  }
}

describe('transformContact (SendRegning)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('c-1')
    expect(result.name).toBe('Test AS')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('sets identification from org number', () => {
    const result = transformContact(makeContact())
    expect(result.identification).toBe('123456789')
  })

  it('sets isCustomer and isSupplier flags', () => {
    const customer = transformContact(makeContact({ isRecipient: true }))
    expect(customer.isCustomer).toBe(true)
    expect(customer.isSupplier).toBe(false)

    const nonRecipient = transformContact(makeContact({ isRecipient: false }))
    expect(nonRecipient.isCustomer).toBe(false)
    expect(nonRecipient.isSupplier).toBe(false)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
