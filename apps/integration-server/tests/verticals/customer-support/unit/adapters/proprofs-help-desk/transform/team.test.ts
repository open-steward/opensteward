import { describe, it, expect } from 'vitest'
import {
  transformTeam,
  type RawProprofsInbox,
} from '../../../../../../../src/verticals/customer-support/adapters/proprofs-help-desk/transform/team'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema/team'

describe('proprofs-help-desk transformTeam', () => {
  it('maps a fully-populated inbox to a canonical team', () => {
    const raw: RawProprofsInbox = {
      id: 'IB001-001',
      name: 'Support',
      email: 'support@example.com',
    }

    const result = transformTeam(raw)

    // id maps from raw.id (as string)
    expect(result.id).toBe('IB001-001')
    expect(result.externalId).toBe('IB001-001')
    // name maps directly
    expect(result.name).toBe('Support')
    // email is in metadata
    expect(result.metadata['email']).toBe('support@example.com')
    // platform
    expect(result.platform).toBe('proprofs-help-desk')

    expect(() => TeamSchema.parse(result)).not.toThrow()
  })

  it('maps a numeric inbox id to string', () => {
    const raw: RawProprofsInbox = {
      id: 42,
      name: 'Sales',
    }

    const result = transformTeam(raw)

    expect(result.id).toBe('42')
    expect(result.name).toBe('Sales')

    expect(() => TeamSchema.parse(result)).not.toThrow()
  })

  it('produces empty string id and name when all fields absent', () => {
    const raw: RawProprofsInbox = {}

    const result = transformTeam(raw)

    expect(result.id).toBe('')
    expect(result.name).toBe('')

    expect(() => TeamSchema.parse(result)).not.toThrow()
  })
})
