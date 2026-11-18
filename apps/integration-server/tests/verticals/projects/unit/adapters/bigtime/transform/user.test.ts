import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawBigtimeStaff,
} from '../../../../../../../src/verticals/projects/adapters/bigtime/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('bigtime transformUser', () => {
  const raw: RawBigtimeStaff = {
    StaffSid: 42,
    FName: 'Jane',
    SName: 'Doe',
    FullName: 'Jane Doe',
    EMail: 'jane@example.com',
    Title: 'Engineer',
    IsInactive: false,
    GroupNm: 'Engineering',
    StaffOrgId: 10,
    ManagerID: 5,
  }

  it('maps id from StaffSid', () => {
    const result = transformUser(raw, 'firm_1')
    expect(result.id).toBe('42')
  })

  it('prefers FullName over FName+SName', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('falls back to FName+SName when FullName absent', () => {
    const result = transformUser({ ...raw, FullName: undefined })
    expect(result.name).toBe('Jane Doe')
  })

  it('maps email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane@example.com')
  })

  it('drops email that has no @ sign', () => {
    const result = transformUser({ ...raw, EMail: 'notanemail' })
    expect(result.email).toBeUndefined()
  })

  it('workspaceIds contains firmId', () => {
    const result = transformUser(raw, 'firm_1')
    expect(result.workspaceIds).toEqual(['firm_1'])
  })

  it('platform is bigtime', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('bigtime')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw, 'firm_1')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
