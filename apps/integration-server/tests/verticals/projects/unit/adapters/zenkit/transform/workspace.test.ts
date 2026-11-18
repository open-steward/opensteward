import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawAirtableWorkspace,
} from '../../../../../../../src/verticals/projects/adapters/zenkit/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('zenkit transformWorkspace', () => {
  const raw: RawAirtableWorkspace = {
    gid: 'ws-gid-1',
    name: 'Acme Industries',
    is_organization: true,
    email_domains: ['acme.com', 'acme.co.uk'],
  }

  it('maps id and externalId from gid', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('ws-gid-1')
    expect(result.externalId).toBe('ws-gid-1')
  })

  it('maps name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Acme Industries')
  })

  it('name is empty string when absent', () => {
    const result = transformWorkspace({ ...raw, name: undefined })
    expect(result.name).toBe('')
  })

  it('platform is zenkit', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('zenkit')
  })

  it('metadata includes isOrganization as string', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.isOrganization).toBe('true')
  })

  it('metadata includes emailDomains as joined string', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.emailDomains).toBe('acme.com,acme.co.uk')
  })

  it('metadata emailDomains is absent when email_domains not provided', () => {
    const result = transformWorkspace({ ...raw, email_domains: undefined })
    expect(result.metadata.emailDomains).toBeUndefined()
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
