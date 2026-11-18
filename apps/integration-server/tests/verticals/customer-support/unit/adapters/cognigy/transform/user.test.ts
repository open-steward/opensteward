import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawCognigyAgent,
} from '../../../../../../../src/verticals/customer-support/adapters/cognigy/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/customer-support/schema/user'

describe('cognigy transformUser', () => {
  const raw: RawCognigyAgent = {
    id: 10,
    name: 'Olivia Agent',
    email: 'olivia@example.com',
    role: 'agent',
    availability_status: 'busy',
    auto_offline: false,
    confirmed: true,
  }

  it('maps id to string', () => {
    const out = transformUser(raw)
    expect(out.id).toBe('10')
  })

  it('maps email', () => {
    const out = transformUser(raw)
    expect(out.email).toBe('olivia@example.com')
  })

  it('maps name', () => {
    const out = transformUser(raw)
    expect(out.name).toBe('Olivia Agent')
  })

  it('maps role', () => {
    const out = transformUser(raw)
    expect(out.role).toBe('agent')
  })

  it('teamIds is always an empty array (Chatwoot agent endpoint has no team membership)', () => {
    const out = transformUser(raw)
    expect(out.teamIds).toEqual([])
  })

  it('sets platform to cognigy', () => {
    const out = transformUser(raw)
    expect(out.platform).toBe('cognigy')
  })

  it('stores availabilityStatus in metadata', () => {
    const out = transformUser(raw)
    expect(out.metadata.availabilityStatus).toBe('busy')
  })

  it('stores confirmed in metadata', () => {
    const out = transformUser(raw)
    expect(out.metadata.confirmed).toBe('true')
  })

  it('passes UserSchema.parse', () => {
    const out = transformUser(raw)
    expect(() => UserSchema.parse(out)).not.toThrow()
  })

  it('maps administrator role', () => {
    const out = transformUser({ ...raw, role: 'administrator' })
    expect(out.role).toBe('administrator')
  })
})
