import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type FenbeitongContact } from '../../../../../../../src/verticals/accounting/adapters/fenbeitong/transform/contact'

function makeContact(overrides: Partial<FenbeitongContact> = {}): FenbeitongContact {
  return {
    employeeId: 'emp-1',
    employeeName: 'Zhang Wei',
    phone: '13800138000',
    email: 'zhang.wei@company.cn',
    department: 'Finance',
    ...overrides,
  }
}

describe('transformContact (fenbeitong)', () => {
  it('maps id from employeeId', () => { expect(transformContact(makeContact()).id).toBe('emp-1') })
  it('maps name from employeeName', () => { expect(transformContact(makeContact()).name).toBe('Zhang Wei') })
  it('maps telephone from phone', () => { expect(transformContact(makeContact()).telephones?.[0]?.telephone).toBe('13800138000') })
  it('maps email', () => { expect(transformContact(makeContact()).emails?.[0]?.email).toBe('zhang.wei@company.cn') })
  it('maps address1 from department', () => { expect(transformContact(makeContact()).billingAddress?.address1).toBe('Finance') })
  it('handles missing phone', () => { expect(transformContact(makeContact({ phone: undefined })).telephones).toBeUndefined() })
  it('metadata identity', () => { const raw = makeContact(); expect(transformContact(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
