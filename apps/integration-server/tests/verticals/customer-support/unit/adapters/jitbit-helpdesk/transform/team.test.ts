import { describe, it, expect } from 'vitest'
import {
  transformTeam,
  type RawJitbitCategory,
} from '../../../../../../../src/verticals/customer-support/adapters/jitbit-helpdesk/transform/team'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema/team'

describe('jitbit-helpdesk transformTeam', () => {
  it('maps CategoryID to id and externalId', () => {
    const raw: RawJitbitCategory = {
      CategoryID: 10,
      Name: 'Support',
      NameWithSection: 'Support > General',
    }
    const result = transformTeam(raw)
    expect(result.id).toBe('10')
    expect(result.externalId).toBe('10')
  })

  it('prefers NameWithSection over Name', () => {
    const raw: RawJitbitCategory = {
      CategoryID: 1,
      Name: 'Support',
      NameWithSection: 'Support > Tier 1',
    }
    const result = transformTeam(raw)
    expect(result.name).toBe('Support > Tier 1')
  })

  it('falls back to Name when NameWithSection is absent', () => {
    const raw: RawJitbitCategory = { CategoryID: 2, Name: 'Billing' }
    const result = transformTeam(raw)
    expect(result.name).toBe('Billing')
  })

  it('sets platform to jitbit-helpdesk', () => {
    const raw: RawJitbitCategory = { CategoryID: 3, Name: 'Tech' }
    const result = transformTeam(raw)
    expect(result.platform).toBe('jitbit-helpdesk')
  })

  it('stores section metadata', () => {
    const raw: RawJitbitCategory = { CategoryID: 4, Name: 'Sub', Section: 'Main', SectionID: 99 }
    const result = transformTeam(raw)
    expect(result.metadata['section']).toBe('Main')
    expect(result.metadata['sectionId']).toBe('99')
  })

  it('passes TeamSchema validation', () => {
    const raw: RawJitbitCategory = {
      CategoryID: 99,
      Name: 'Valid Queue',
      NameWithSection: 'Dept > Valid Queue',
      ForTechsOnly: false,
    }
    const result = transformTeam(raw)
    expect(() => TeamSchema.parse(result)).not.toThrow()
  })
})
