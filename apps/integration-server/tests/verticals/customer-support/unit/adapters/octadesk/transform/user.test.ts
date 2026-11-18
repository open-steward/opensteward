import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawOctadeskAgent,
} from '../../../../../../../src/verticals/customer-support/adapters/octadesk/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema/user'

describe('octadesk transformUser', () => {
  const raw: RawOctadeskAgent = {
    id: 'agent-uuid-77',
    name: 'Ana Suporte',
    email: 'ana@company.example',
    role: { id: 'role-1', name: 'Agent' },
    group: { id: 'group-uuid-2', name: 'Tier 2' },
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('agent-uuid-77')
    expect(result.externalId).toBe('agent-uuid-77')
  })

  it('maps name field', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Ana Suporte')
  })

  it('maps email field', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('ana@company.example')
  })

  it('extracts role name from role object', () => {
    const result = transformUser(raw)
    expect(result.role).toBe('Agent')
  })

  it('maps role when it is a plain string', () => {
    const strRole: RawOctadeskAgent = { ...raw, role: 'Supervisor' }
    const result = transformUser(strRole)
    expect(result.role).toBe('Supervisor')
  })

  it('maps group.id to teamIds array', () => {
    const result = transformUser(raw)
    expect(result.teamIds).toEqual(['group-uuid-2'])
  })

  it('teamIds is empty when group is absent', () => {
    const noGroup: RawOctadeskAgent = { ...raw, group: undefined }
    const result = transformUser(noGroup)
    expect(result.teamIds).toEqual([])
  })

  it('places groupName in metadata', () => {
    const result = transformUser(raw)
    expect(result.metadata['groupName']).toBe('Tier 2')
  })

  it('sets platform to octadesk', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('octadesk')
  })

  it('produces a UserSchema-valid result', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('handles absent email — email is undefined', () => {
    const noEmail: RawOctadeskAgent = { ...raw, email: undefined }
    const result = transformUser(noEmail)
    expect(result.email).toBeUndefined()
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
