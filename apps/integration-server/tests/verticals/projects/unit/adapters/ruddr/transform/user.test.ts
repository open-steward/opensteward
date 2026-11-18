import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawRuddrMember,
} from '../../../../../../../src/verticals/projects/adapters/ruddr/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('ruddr transformUser', () => {
  const baseRaw: RawRuddrMember = {
    id: 'member-1',
    name: 'Jane Doe',
    email: 'jane.doe@acme.example',
    isActive: true,
    isBillable: true,
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformUser(baseRaw)
    expect(result.id).toBe('member-1')
    expect(result.externalId).toBe('member-1')
  })

  it('maps name from raw.name', () => {
    const result = transformUser(baseRaw)
    expect(result.name).toBe('Jane Doe')
  })

  it('maps email from raw.email', () => {
    const result = transformUser(baseRaw)
    expect(result.email).toBe('jane.doe@acme.example')
  })

  it('email is undefined when raw.email is absent', () => {
    const raw: RawRuddrMember = { id: 'member-2' }
    const result = transformUser(raw)
    expect(result.email).toBeUndefined()
  })

  it('platform is ruddr', () => {
    const result = transformUser(baseRaw)
    expect(result.platform).toBe('ruddr')
  })

  // --- workspaceIds ---

  it('workspaceIds includes the workspaceId argument', () => {
    const result = transformUser(baseRaw, 'ws-10')
    expect(result.workspaceIds).toContain('ws-10')
    expect(result.workspaceIds).toHaveLength(1)
  })

  it('workspaceIds is empty array when workspaceId argument is omitted', () => {
    const result = transformUser(baseRaw)
    expect(result.workspaceIds).toEqual([])
  })

  it('workspaceIds is empty array when workspaceId argument is undefined', () => {
    const result = transformUser(baseRaw, undefined)
    expect(result.workspaceIds).toEqual([])
  })

  // --- Metadata ---

  it('metadata.isActive reflects raw.isActive as string', () => {
    const result = transformUser(baseRaw)
    expect(result.metadata.isActive).toBe('true')
  })

  it('metadata.isBillable reflects raw.isBillable as string', () => {
    const result = transformUser(baseRaw)
    expect(result.metadata.isBillable).toBe('true')
  })

  it('metadata.isBillable is "false" when raw.isBillable is false', () => {
    const raw: RawRuddrMember = { ...baseRaw, isBillable: false }
    const result = transformUser(raw)
    expect(result.metadata.isBillable).toBe('false')
  })

  it('metadata.jobTitle reflects raw.jobTitle.name as string', () => {
    const raw: RawRuddrMember = {
      ...baseRaw,
      jobTitle: { id: 'jt-1', name: 'Senior Engineer' },
    }
    const result = transformUser(raw)
    expect(result.metadata.jobTitle).toBe('Senior Engineer')
  })

  it('metadata.jobTitle is absent when jobTitle is null', () => {
    const raw: RawRuddrMember = { ...baseRaw, jobTitle: null }
    const result = transformUser(raw)
    expect(Object.keys(result.metadata)).not.toContain('jobTitle')
  })

  it('metadata.employmentTypeId is included when present', () => {
    const raw: RawRuddrMember = { ...baseRaw, employmentTypeId: 'full_time' }
    const result = transformUser(raw)
    expect(result.metadata.employmentTypeId).toBe('full_time')
  })

  it('metadata.practiceName reflects raw.practice.name', () => {
    const raw: RawRuddrMember = {
      ...baseRaw,
      practice: { id: 'prac-1', name: 'Software Engineering' },
    }
    const result = transformUser(raw)
    expect(result.metadata.practiceName).toBe('Software Engineering')
  })

  it('metadata.locationName reflects raw.location.name', () => {
    const raw: RawRuddrMember = {
      ...baseRaw,
      location: { id: 'loc-1', name: 'New York' },
    }
    const result = transformUser(raw)
    expect(result.metadata.locationName).toBe('New York')
  })

  it('metadata.securityRole reflects raw.securityRole.name', () => {
    const raw: RawRuddrMember = {
      ...baseRaw,
      securityRole: { id: 'role-1', name: 'Admin' },
    }
    const result = transformUser(raw)
    expect(result.metadata.securityRole).toBe('Admin')
  })

  it('metadata omits null / undefined values', () => {
    const raw: RawRuddrMember = { id: 'member-3', name: 'Minimal User' }
    const result = transformUser(raw)
    expect(Object.keys(result.metadata)).not.toContain('isActive')
    expect(Object.keys(result.metadata)).not.toContain('isBillable')
    expect(Object.keys(result.metadata)).not.toContain('jobTitle')
    expect(Object.keys(result.metadata)).not.toContain('practiceName')
  })

  it('name falls back to empty string when raw.name is absent', () => {
    const raw: RawRuddrMember = { id: 'member-4' }
    const result = transformUser(raw)
    expect(result.name).toBe('')
  })

  // --- Schema validation ---

  it('passes UserSchema.parse with full fixture', () => {
    const raw: RawRuddrMember = {
      id: 'member-full',
      name: 'Full Fixture User',
      email: 'full@acme.example',
      isActive: true,
      isBillable: false,
      employmentTypeId: 'contractor',
      jobTitle: { id: 'jt-2', name: 'Designer' },
      practice: { id: 'prac-2', name: 'UX' },
      location: { id: 'loc-2', name: 'London' },
      securityRole: { id: 'role-2', name: 'Member' },
      createdAt: '2025-10-01T00:00:00Z',
    }
    const result = transformUser(raw, 'ws-full')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('passes UserSchema.parse with minimal fixture', () => {
    const result = transformUser({ id: 'member-min' })
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
