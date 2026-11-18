/**
 * Fixture: a SubteamResponse as documented for GET /api/v1.0/subteams in
 * https://developers.niftypm.com/docs/api/v1.0/1.0/nifty-v1-openapi.json
 * (required: id, name, initials, logo, color, secondary_color, is_general,
 * owner, members). The spec gives no example values; these are placeholders.
 */
import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawNiftySubteam,
} from '../../../../../../../src/verticals/projects/adapters/nifty/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

function makeSubteam(overrides: Partial<RawNiftySubteam> = {}): RawNiftySubteam {
  return {
    id: 'St5hYc1Bn',
    name: 'Marketing',
    initials: 'MK',
    logo: '',
    color: '#00A99B',
    secondary_color: '#0F172A',
    is_general: false,
    owner: 'i5vtiganU9y25V',
    members: ['i5vtiganU9y25V', 'j7kwmqbxT2p9Lm'],
    ...overrides,
  }
}

describe('nifty transformWorkspace', () => {
  it('parses as a canonical Workspace', () => {
    expect(() => WorkspaceSchema.parse(transformWorkspace(makeSubteam()))).not.toThrow()
  })

  it('maps id, externalId and name', () => {
    const result = WorkspaceSchema.parse(transformWorkspace(makeSubteam()))
    expect(result.id).toBe('St5hYc1Bn')
    expect(result.externalId).toBe('St5hYc1Bn')
    expect(result.name).toBe('Marketing')
  })

  it('throws rather than inventing an empty name when name is absent', () => {
    const raw = makeSubteam()
    delete (raw as Record<string, unknown>)['name']
    expect(() => transformWorkspace(raw)).toThrow(/no name/)
  })

  it('memberCount is the length of members', () => {
    expect(WorkspaceSchema.parse(transformWorkspace(makeSubteam())).memberCount).toBe(2)
  })

  it('metadata carries initials, color, isGeneral and owner', () => {
    const { metadata } = WorkspaceSchema.parse(
      transformWorkspace(makeSubteam({ is_general: true })),
    )
    expect(metadata).toEqual({
      initials: 'MK',
      color: '#00A99B',
      isGeneral: 'true',
      owner: 'i5vtiganU9y25V',
    })
  })

  it('platform is nifty', () => {
    expect(transformWorkspace(makeSubteam()).platform).toBe('nifty')
  })
})
