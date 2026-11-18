import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type JumisContact } from '../../../../../../../src/verticals/accounting/adapters/jumis/transform/contact'

function makeContact(overrides: Partial<JumisContact> = {}): JumisContact {
  return {
    id: '99',
    name: 'Latvian Firm SIA',
    reg_nr: 'LV40003000001',
    email: 'office@latvianfirm.lv',
    ...overrides,
  }
}

describe('transformContact (jumis)', () => {
  it('maps id', () => {
    expect(transformContact(makeContact()).id).toBe('99')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Latvian Firm SIA')
  })

  it('maps reg_nr to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('LV40003000001')
  })

  it('maps email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('office@latvianfirm.lv')
  })

  it('sets isCustomer true', () => {
    expect(transformContact(makeContact()).isCustomer).toBe(true)
  })

  it('sets isSupplier false', () => {
    expect(transformContact(makeContact()).isSupplier).toBe(false)
  })

  it('handles missing email', () => {
    expect(transformContact(makeContact({ email: undefined })).emails).toBeUndefined()
  })

  it('metadata identity', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
