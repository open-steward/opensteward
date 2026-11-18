import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawZohoSprintsTeam,
} from '../../../../../../../src/verticals/projects/adapters/zoho-sprints/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('zoho-sprints transformWorkspace', () => {
  const raw: RawZohoSprintsTeam = {
    teamId: 'team-9',
    name: 'Acme Corp',
    zsoid: 'org-123',
    domain: 'acme.zohosprint.com',
    createdTime: 1704067200000,
    memberCount: 15,
  }

  it('maps id and externalId from teamId', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('team-9')
    expect(result.externalId).toBe('team-9')
  })

  it('maps name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Acme Corp')
  })

  it('platform is zoho-sprints', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('zoho-sprints')
  })

  it('metadata includes zsoid and domain', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata['zsoid']).toBe('org-123')
    expect(result.metadata['domain']).toBe('acme.zohosprint.com')
  })

  it('metadata includes memberCount as string', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata['memberCount']).toBe('15')
  })

  it('metadata createdTime is ISO string', () => {
    const result = transformWorkspace(raw)
    // toIso(1704067200000) → '2024-01-01T00:00:00.000Z'
    expect(result.metadata['createdTime']).toBe('2024-01-01T00:00:00.000Z')
  })

  it('name is empty string when not provided', () => {
    const result = transformWorkspace({ teamId: 'team-x' })
    expect(result.name).toBe('')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
