import { describe, it, expect } from 'vitest'
import {
  transformTeam,
  type RawLibredeskTeam,
} from '../../../../../../../src/verticals/customer-support/adapters/libredesk/transform/team'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema/team'

describe('libredesk transformTeam', () => {
  it('maps id and externalId from raw.id', () => {
    const raw: RawLibredeskTeam = { id: 3, name: 'Support' }
    const result = transformTeam(raw)
    expect(result.id).toBe('3')
    expect(result.externalId).toBe('3')
  })

  it('maps name to name', () => {
    const raw: RawLibredeskTeam = { id: 1, name: 'Engineering' }
    const result = transformTeam(raw)
    expect(result.name).toBe('Engineering')
  })

  it('sets platform to libredesk', () => {
    const raw: RawLibredeskTeam = { id: 2, name: 'Sales' }
    const result = transformTeam(raw)
    expect(result.platform).toBe('libredesk')
  })

  it('stores emoji in metadata', () => {
    const raw: RawLibredeskTeam = { id: 4, name: 'Dev', emoji: '💻' }
    const result = transformTeam(raw)
    expect(result.metadata['emoji']).toBe('💻')
  })

  it('stores timezone in metadata', () => {
    const raw: RawLibredeskTeam = { id: 5, name: 'EU', timezone: 'Europe/Berlin' }
    const result = transformTeam(raw)
    expect(result.metadata['timezone']).toBe('Europe/Berlin')
  })

  it('passes TeamSchema validation', () => {
    const raw: RawLibredeskTeam = {
      id: 99,
      name: 'Valid Team',
      conversation_assignment_type: 'round_robin',
      timezone: 'UTC',
    }
    const result = transformTeam(raw)
    expect(() => TeamSchema.parse(result)).not.toThrow()
  })
})
