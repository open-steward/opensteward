import { describe, it, expect } from 'vitest'
import {
  transformTeam,
  type RawLivehelpnowDepartment,
} from '../../../../../../../src/verticals/customer-support/adapters/livehelpnow/transform/team'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema/team'

describe('livehelpnow transformTeam', () => {
  it('maps department_id to id and externalId', () => {
    const raw: RawLivehelpnowDepartment = { department_id: 3, department_name: 'Support' }
    const result = transformTeam(raw)
    expect(result.id).toBe('3')
    expect(result.externalId).toBe('3')
  })

  it('maps department_name to name', () => {
    const raw: RawLivehelpnowDepartment = { department_id: 1, department_name: 'Sales' }
    const result = transformTeam(raw)
    expect(result.name).toBe('Sales')
  })

  it('sets platform to livehelpnow', () => {
    const raw: RawLivehelpnowDepartment = { department_id: 2, department_name: 'Tech' }
    const result = transformTeam(raw)
    expect(result.platform).toBe('livehelpnow')
  })

  it('stores department_email in metadata', () => {
    const raw: RawLivehelpnowDepartment = {
      department_id: 4,
      department_name: 'Billing',
      department_email: 'billing@company.com',
    }
    const result = transformTeam(raw)
    expect(result.metadata['email']).toBe('billing@company.com')
  })

  it('stores department_description in metadata', () => {
    const raw: RawLivehelpnowDepartment = {
      department_id: 5,
      department_name: 'VIP',
      department_description: 'Premium customers',
    }
    const result = transformTeam(raw)
    expect(result.metadata['description']).toBe('Premium customers')
  })

  it('passes TeamSchema validation', () => {
    const raw: RawLivehelpnowDepartment = {
      department_id: 99,
      department_name: 'Valid Department',
      department_email: 'dept@example.com',
    }
    const result = transformTeam(raw)
    expect(() => TeamSchema.parse(result)).not.toThrow()
  })
})
