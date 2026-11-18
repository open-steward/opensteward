import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawPingcodeTeam,
} from '../../../../../../../src/verticals/projects/adapters/pingcode/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('transformWorkspace', () => {
  it('maps all fields from a fully populated pingcode team/enterprise', () => {
    const raw: RawPingcodeTeam = {
      id: 'ent_acme',
      name: 'Acme Industries',
      secondary_domain: 'acme.pingcode.com',
    }

    const result = transformWorkspace(raw)

    expect(result.id).toBe('ent_acme')
    expect(result.externalId).toBe('ent_acme')
    expect(result.name).toBe('Acme Industries')
    expect(result.platform).toBe('pingcode')
    expect(result.metadata.secondaryDomain).toBe('acme.pingcode.com')
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })

  it('defaults name to empty string when absent', () => {
    const raw: RawPingcodeTeam = {
      id: 'ent_002',
    }

    const result = transformWorkspace(raw)

    expect(result.name).toBe('')
    expect(result.metadata.secondaryDomain).toBeUndefined()
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })

  it('omits secondaryDomain from metadata when not present', () => {
    const raw: RawPingcodeTeam = {
      id: 'ent_003',
      name: 'Beta Corp',
    }

    const result = transformWorkspace(raw)

    expect(result.metadata).not.toHaveProperty('secondaryDomain')
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })

  it('sets id and externalId to the same value', () => {
    const raw: RawPingcodeTeam = {
      id: 'ent_004',
      name: 'Gamma LLC',
      secondary_domain: 'gamma.pingcode.com',
    }

    const result = transformWorkspace(raw)

    expect(result.id).toBe(result.externalId)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
