import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawGooddayUser,
} from '../../../../../../../src/verticals/projects/adapters/goodday/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('goodday transformUser', () => {
  const raw: RawGooddayUser = {
    id: 'usr_jane',
    name: 'Jane Doe',
    primaryEmail: 'jane.doe@acme.example',
    companyRole: 'Engineer',
    isAdmin: false,
    momentCreated: 1700000000000,
    reportsToUserId: 'usr_mgr',
    departmentId: 'dept_eng',
    departmentName: 'Engineering',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('usr_jane')
    expect(result.externalId).toBe('usr_jane')
  })

  it('maps email from raw.primaryEmail', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane.doe@acme.example')
  })

  it('email is undefined when primaryEmail is absent', () => {
    const result = transformUser({ ...raw, primaryEmail: null })
    expect(result.email).toBeUndefined()
  })

  it('maps name from raw.name', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('name is empty string when raw.name is absent', () => {
    const result = transformUser({ id: 'usr_x', name: null })
    expect(result.name).toBe('')
  })

  it('workspaceIds is always an empty array', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is goodday', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('goodday')
  })

  it('metadata.companyRole reflects raw.companyRole', () => {
    const result = transformUser(raw)
    expect(result.metadata['companyRole']).toBe('Engineer')
  })

  it('metadata.isAdmin reflects raw.isAdmin', () => {
    const result = transformUser(raw)
    expect(result.metadata['isAdmin']).toBe('false')
  })

  it('metadata.isAdmin is true string for admin user', () => {
    const result = transformUser({ ...raw, isAdmin: true })
    expect(result.metadata['isAdmin']).toBe('true')
  })

  it('metadata.reportsToUserId reflects raw.reportsToUserId', () => {
    const result = transformUser(raw)
    expect(result.metadata['reportsToUserId']).toBe('usr_mgr')
  })

  it('metadata.departmentId reflects raw.departmentId', () => {
    const result = transformUser(raw)
    expect(result.metadata['departmentId']).toBe('dept_eng')
  })

  it('metadata.departmentName reflects raw.departmentName', () => {
    const result = transformUser(raw)
    expect(result.metadata['departmentName']).toBe('Engineering')
  })

  it('metadata.createdAt converts epoch ms to ISO string', () => {
    const result = transformUser(raw)
    expect(result.metadata['createdAt']).toBe(new Date(1700000000000).toISOString())
  })

  it('metadata omits null reportsToUserId', () => {
    const result = transformUser({ ...raw, reportsToUserId: null })
    expect(result.metadata['reportsToUserId']).toBeUndefined()
  })

  it('metadata omits null departmentId', () => {
    const result = transformUser({ ...raw, departmentId: null })
    expect(result.metadata['departmentId']).toBeUndefined()
  })

  it('metadata omits absent momentCreated', () => {
    const result = transformUser({ ...raw, momentCreated: null })
    expect(result.metadata['createdAt']).toBeUndefined()
  })

  it('passes UserSchema.parse with full raw', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('passes UserSchema.parse with minimal raw', () => {
    const result = transformUser({ id: 'usr_min' })
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
