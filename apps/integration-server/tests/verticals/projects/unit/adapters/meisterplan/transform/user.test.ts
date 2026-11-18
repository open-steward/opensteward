import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawMeisterplanResource,
} from '../../../../../../../src/verticals/projects/adapters/meisterplan/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('meisterplan transformUser (resource)', () => {
  const raw: RawMeisterplanResource = {
    id: 'res-001',
    firstName: 'Jane',
    lastName: 'Doe',
    emailAddress: 'jane.doe@example.com',
    externalId: 'ext-jane',
    primaryRole: { id: 'role-dev' },
  }

  it('maps id and externalId', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('res-001')
    expect(result.externalId).toBe('ext-jane')
  })

  it('falls back externalId to raw.id when externalId is absent', () => {
    const result = transformUser({ id: 'res-002', externalId: null })
    expect(result.externalId).toBe('res-002')
  })

  it('maps name from firstName + lastName', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('name is id when both firstName and lastName are absent', () => {
    const result = transformUser({ id: 'res-003' })
    expect(result.name).toBe('res-003')
  })

  it('maps email from emailAddress', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane.doe@example.com')
  })

  it('workspaceIds contains supplied workspaceId', () => {
    const result = transformUser(raw, 'scenario-1')
    expect(result.workspaceIds).toEqual(['scenario-1'])
  })

  it('workspaceIds is empty when no workspaceId supplied', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is meisterplan', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('meisterplan')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw, 'scenario-1')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
