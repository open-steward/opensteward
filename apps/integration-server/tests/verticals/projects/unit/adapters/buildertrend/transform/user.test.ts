import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawBuildertrendUser,
} from '../../../../../../../src/verticals/projects/adapters/buildertrend/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('buildertrend transformUser', () => {
  const raw: RawBuildertrendUser = {
    id: 55,
    firstName: 'Bob',
    lastName: 'Builder',
    displayName: 'Bob Builder',
    email: 'bob@buildertrend.example',
    builderId: 10,
    userType: 'Internal',
  }

  it('maps id from id field', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('55')
  })

  it('prefers displayName for name', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Bob Builder')
  })

  it('falls back to firstName+lastName when displayName absent', () => {
    const result = transformUser({ ...raw, displayName: undefined })
    expect(result.name).toBe('Bob Builder')
  })

  it('maps email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('bob@buildertrend.example')
  })

  it('prefers explicit workspaceId over builderId', () => {
    const result = transformUser(raw, 'explicit_ws')
    expect(result.workspaceIds).toEqual(['explicit_ws'])
  })

  it('uses builderId when no workspaceId arg', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual(['10'])
  })

  it('metadata includes userType', () => {
    const result = transformUser(raw)
    expect(result.metadata.userType).toBe('Internal')
  })

  it('platform is buildertrend', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('buildertrend')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw, '10')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
