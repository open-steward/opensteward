import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawMovideskAgent,
} from '../../../../../../../src/verticals/customer-support/adapters/movidesk/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema/user'

describe('movidesk transformUser', () => {
  const raw: RawMovideskAgent = {
    id: 'agent-abc',
    codeReferenceAdditional: 'EMP-001',
    businessName: 'Support Agent',
    profileType: 1,
    personType: 1,
    isActive: true,
    accessProfile: 'N1 Agent',
    emails: [{ email: 'agent@company.example', isDefault: true }],
    teams: [
      { id: 5, name: 'Tier 1' },
      { id: 6, name: 'Tier 2' },
    ],
  }

  it('maps id from raw.id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('agent-abc')
  })

  it('maps externalId from codeReferenceAdditional when present', () => {
    const result = transformUser(raw)
    expect(result.externalId).toBe('EMP-001')
  })

  it('maps businessName to name', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Support Agent')
  })

  it('maps default email from emails array', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('agent@company.example')
  })

  it('maps accessProfile to role', () => {
    const result = transformUser(raw)
    expect(result.role).toBe('N1 Agent')
  })

  it('maps team ids to teamIds array as strings', () => {
    const result = transformUser(raw)
    expect(result.teamIds).toEqual(['5', '6'])
  })

  it('sets platform to movidesk', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('movidesk')
  })

  it('produces a UserSchema-valid result', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('teamIds is empty when no teams provided', () => {
    const noTeams: RawMovideskAgent = { ...raw, teams: [] }
    const result = transformUser(noTeams)
    expect(result.teamIds).toEqual([])
  })

  it('handles absent emails — email is undefined', () => {
    const noEmail: RawMovideskAgent = { ...raw, emails: [] }
    const result = transformUser(noEmail)
    expect(result.email).toBeUndefined()
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
