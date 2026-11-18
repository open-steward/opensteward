import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawSuiteProjectsUser,
} from '../../../../../../../src/verticals/projects/adapters/suiteprojects-pro/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('suiteprojects-pro transformUser', () => {
  const raw: RawSuiteProjectsUser = {
    id: 42,
    email: 'jane.doe@acme.example',
    firstName: 'Jane',
    lastName: 'Doe',
    displayName: 'Jane Doe',
    nickname: 'jdoe',
    isActive: true,
    created: '2025-06-01T00:00:00.000Z',
    updated: '2026-01-10T00:00:00.000Z',
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane.doe@acme.example')
  })

  it('uses displayName as name when present', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('falls back to firstName + lastName when displayName is absent', () => {
    const result = transformUser({ ...raw, displayName: undefined })
    expect(result.name).toBe('Jane Doe')
  })

  it('falls back to nickname when firstName and lastName are also absent', () => {
    const result = transformUser({ id: 1, nickname: 'jdoe' })
    expect(result.name).toBe('jdoe')
  })

  it('workspaceIds is always empty array', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('stores nickname in metadata', () => {
    const result = transformUser(raw)
    expect(result.metadata.nickname).toBe('jdoe')
  })

  it('platform is suiteprojects-pro', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('suiteprojects-pro')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
