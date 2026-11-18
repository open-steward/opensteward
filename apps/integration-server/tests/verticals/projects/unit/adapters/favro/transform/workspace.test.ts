import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawFavroOrganization,
} from '../../../../../../../src/verticals/projects/adapters/favro/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('favro transformWorkspace', () => {
  const raw: RawFavroOrganization = {
    organizationId: 'org-xyz',
    name: 'Acme Corp',
    sharedToUsers: [
      { userId: 'user-alice', role: 'administrator', joinDate: '2023-01-01' },
      { userId: 'user-bob', role: 'fullMember', joinDate: '2023-06-01' },
    ],
  }

  it('maps id and externalId from organizationId', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('org-xyz')
    expect(result.externalId).toBe('org-xyz')
  })

  it('maps name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Acme Corp')
  })

  it('memberCount reflects sharedToUsers array length', () => {
    const result = transformWorkspace(raw)
    expect(result.memberCount).toBe(2)
  })

  it('memberCount is undefined when sharedToUsers is absent', () => {
    const result = transformWorkspace({ organizationId: 'org-bare', name: 'Bare' })
    expect(result.memberCount).toBeUndefined()
  })

  it('platform is favro', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('favro')
  })

  it('name is empty string when absent', () => {
    const result = transformWorkspace({ organizationId: 'org-1' })
    expect(result.name).toBe('')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
