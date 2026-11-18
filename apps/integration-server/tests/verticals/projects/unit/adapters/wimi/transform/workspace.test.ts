import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawLinearWorkspace,
} from '../../../../../../../src/verticals/projects/adapters/wimi/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('wimi transformWorkspace', () => {
  const raw: RawLinearWorkspace = {
    gid: 'ws-10',
    name: 'Acme Corp',
    is_organization: true,
    email_domains: ['acme.com', 'acme.org'],
  }

  it('maps id and externalId from gid', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('ws-10')
    expect(result.externalId).toBe('ws-10')
  })

  it('maps name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Acme Corp')
  })

  it('platform is wimi', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('wimi')
  })

  it('metadata.isOrganization is "true"', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.isOrganization).toBe('true')
  })

  it('metadata.emailDomains joins domains with comma', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.emailDomains).toBe('acme.com,acme.org')
  })

  it('metadata.emailDomains absent when email_domains not set', () => {
    const result = transformWorkspace({ ...raw, email_domains: undefined })
    expect(result.metadata.emailDomains).toBeUndefined()
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
