import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawFloatPerson,
} from '../../../../../../../src/verticals/projects/adapters/float/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('float transformUser', () => {
  const raw: RawFloatPerson = {
    people_id: 7,
    name: 'Jane Doe',
    email: 'jane.doe@acme.example',
    job_title: 'Senior Designer',
    department: { department_id: 3, name: 'Creative' },
    employee_type: 1,
    people_type_id: 1,
    active: 1,
    tags: [{ name: 'full-time' }, 'remote'],
    created: '2025-06-01 08:00:00',
    modified: '2026-01-15 10:00:00',
  }

  it('maps people_id to id and externalId as string', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
  })

  it('maps name from raw.name', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('maps email from raw.email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane.doe@acme.example')
  })

  it('workspaceIds is always an empty array (account-level)', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is float', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('float')
  })

  it('metadata.departmentId comes from department object department_id', () => {
    const result = transformUser(raw)
    expect(result.metadata.departmentId).toBe('3')
  })

  it('metadata.departmentName comes from department object name', () => {
    const result = transformUser(raw)
    expect(result.metadata.departmentName).toBe('Creative')
  })

  it('metadata.jobTitle maps from job_title', () => {
    const result = transformUser(raw)
    expect(result.metadata.jobTitle).toBe('Senior Designer')
  })

  it('metadata.active is "true" when active=1 (isTruthy)', () => {
    const result = transformUser(raw)
    expect(result.metadata.active).toBe('true')
  })

  it('metadata.active is "false" when active=0', () => {
    const result = transformUser({ ...raw, active: 0 })
    expect(result.metadata.active).toBe('false')
  })

  it('metadata.tags joins tag names from mixed array', () => {
    const result = transformUser(raw)
    expect(result.metadata.tags).toBe('full-time,remote')
  })

  it('handles scalar department id (non-object)', () => {
    const result = transformUser({ ...raw, department: 5 })
    expect(result.metadata.departmentId).toBe('5')
    expect(result.metadata.departmentName).toBeUndefined()
  })

  it('handles null department gracefully', () => {
    const result = transformUser({ ...raw, department: null })
    expect(result.metadata.departmentId).toBeUndefined()
    expect(result.metadata.departmentName).toBeUndefined()
  })

  it('email is undefined when absent', () => {
    const result = transformUser({ ...raw, email: null })
    expect(result.email).toBeUndefined()
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('handles minimal raw object gracefully', () => {
    const result = transformUser({ people_id: 1 })
    expect(result.id).toBe('1')
    expect(result.name).toBe('')
    expect(result.workspaceIds).toEqual([])
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
