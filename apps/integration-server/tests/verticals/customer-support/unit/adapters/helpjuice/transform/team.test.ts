import { describe, it, expect } from 'vitest'
import {
  transformTeam,
  type RawHelpjuiceGroup,
} from '../../../../../../../src/verticals/customer-support/adapters/helpjuice/transform/team'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema/team'

describe('helpjuice transformTeam', () => {
  it('maps id and externalId from raw.id', () => {
    const raw: RawHelpjuiceGroup = { id: 7, name: 'Support' }
    const result = transformTeam(raw)
    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
  })

  it('maps name from raw.name', () => {
    const raw: RawHelpjuiceGroup = { id: 1, name: 'Engineering' }
    const result = transformTeam(raw)
    expect(result.name).toBe('Engineering')
  })

  it('sets platform to helpjuice', () => {
    const raw: RawHelpjuiceGroup = { id: 2, name: 'Sales' }
    const result = transformTeam(raw)
    expect(result.platform).toBe('helpjuice')
  })

  it('stores smartLoad in metadata', () => {
    const raw: RawHelpjuiceGroup = { id: 3, name: 'Ops', smart_load: true }
    const result = transformTeam(raw)
    expect(result.metadata['smartLoad']).toBe('true')
  })

  it('passes TeamSchema validation', () => {
    const raw: RawHelpjuiceGroup = { id: 99, name: 'All Hands', smart_load: false }
    const result = transformTeam(raw)
    expect(() => TeamSchema.parse(result)).not.toThrow()
  })

  it('falls back to empty string for missing name', () => {
    const raw: RawHelpjuiceGroup = { id: 5 }
    const result = transformTeam(raw)
    expect(result.name).toBe('')
  })
})
