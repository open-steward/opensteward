import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type BlacklineContact } from '../../../../../../../src/verticals/accounting/adapters/blackline/transform/contact'

function makeContact(overrides: Partial<BlacklineContact> = {}): BlacklineContact {
  return {
    userId: 'user-001',
    name: 'Jane Approver',
    email: 'jane@example.com',
    phone: '+1-555-0100',
    role: 'Approver',
    isActive: true,
    createdBy: 'admin',
    createdAt: '2024-01-01T00:00:00Z',
    modifiedBy: 'admin',
    modifiedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformContact (BlackLine)', () => {
  it('maps id from userId', () => {
    expect(transformContact(makeContact()).id).toBe('user-001')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Jane Approver')
  })

  it('maps email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('jane@example.com')
  })

  it('maps phone', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+1-555-0100')
  })

  it('maps isActive', () => {
    expect(transformContact(makeContact({ isActive: false })).isActive).toBe(false)
  })

  it('passes raw object as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('omits email when absent', () => {
    const result = transformContact(makeContact({ email: '' }))
    expect(result.emails).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
