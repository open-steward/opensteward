import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawLivehelpnowOperator,
} from '../../../../../../../src/verticals/customer-support/adapters/livehelpnow/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema/user'

describe('livehelpnow transformUser', () => {
  it('maps admin=true to role admin', () => {
    const raw: RawLivehelpnowOperator = { id: 1, first_name: 'Admin', admin: true }
    const result = transformUser(raw)
    expect(result.role).toBe('admin')
  })

  it('maps admin=false to role agent', () => {
    const raw: RawLivehelpnowOperator = { id: 2, first_name: 'Agent', admin: false }
    const result = transformUser(raw)
    expect(result.role).toBe('agent')
  })

  it('concatenates first_name and last_name', () => {
    const raw: RawLivehelpnowOperator = { id: 3, first_name: 'Jane', last_name: 'Doe' }
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('falls back to username when name parts absent', () => {
    const raw: RawLivehelpnowOperator = { id: 4, username: 'jdoe' }
    const result = transformUser(raw)
    expect(result.name).toBe('jdoe')
  })

  it('maps email from raw.email', () => {
    const raw: RawLivehelpnowOperator = {
      id: 5,
      first_name: 'Agent',
      email: 'agent@livehelpnow.com',
    }
    const result = transformUser(raw)
    expect(result.email).toBe('agent@livehelpnow.com')
  })

  it('maps _departmentId to teamIds as single-element array', () => {
    const raw: RawLivehelpnowOperator = { id: 6, first_name: 'Op', _departmentId: 'dept-5' }
    const result = transformUser(raw)
    expect(result.teamIds).toEqual(['dept-5'])
  })

  it('sets teamIds to empty array when _departmentId absent', () => {
    const raw: RawLivehelpnowOperator = { id: 7, first_name: 'Op' }
    const result = transformUser(raw)
    expect(result.teamIds).toEqual([])
  })

  it('sets id and externalId from raw.id', () => {
    const raw: RawLivehelpnowOperator = { id: 42, first_name: 'Test' }
    const result = transformUser(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('sets platform to livehelpnow', () => {
    const raw: RawLivehelpnowOperator = { id: 8, first_name: 'User' }
    const result = transformUser(raw)
    expect(result.platform).toBe('livehelpnow')
  })

  it('passes UserSchema validation', () => {
    const raw: RawLivehelpnowOperator = {
      id: 99,
      first_name: 'Valid',
      last_name: 'Operator',
      email: 'valid@example.com',
      admin: false,
      _departmentId: 'dept-3',
    }
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
