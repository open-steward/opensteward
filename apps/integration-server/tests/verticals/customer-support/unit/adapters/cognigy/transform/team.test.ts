import { describe, it, expect } from 'vitest'
import {
  transformTeam,
  type RawCognigyTeam,
} from '../../../../../../../src/verticals/customer-support/adapters/cognigy/transform/team'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema/team'

describe('cognigy transformTeam', () => {
  const raw: RawCognigyTeam = {
    id: 12,
    name: 'Tier 2 Support',
    description: 'Handles escalated issues',
    allow_auto_assign: true,
    account_id: 1,
    is_member: false,
  }

  it('maps id to string', () => {
    const out = transformTeam(raw)
    expect(out.id).toBe('12')
  })

  it('maps externalId to string id', () => {
    const out = transformTeam(raw)
    expect(out.externalId).toBe('12')
  })

  it('maps name', () => {
    const out = transformTeam(raw)
    expect(out.name).toBe('Tier 2 Support')
  })

  it('sets platform to cognigy', () => {
    const out = transformTeam(raw)
    expect(out.platform).toBe('cognigy')
  })

  it('stores description in metadata', () => {
    const out = transformTeam(raw)
    expect(out.metadata.description).toBe('Handles escalated issues')
  })

  it('stores allowAutoAssign in metadata', () => {
    const out = transformTeam(raw)
    expect(out.metadata.allowAutoAssign).toBe('true')
  })

  it('passes TeamSchema.parse', () => {
    const out = transformTeam(raw)
    expect(() => TeamSchema.parse(out)).not.toThrow()
  })

  it('falls back to empty string for name when missing', () => {
    const out = transformTeam({ id: 99 })
    expect(out.name).toBe('')
  })
})
