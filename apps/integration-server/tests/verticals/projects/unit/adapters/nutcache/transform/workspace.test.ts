import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawNutcacheOrganization,
} from '../../../../../../../src/verticals/projects/adapters/nutcache/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('nutcache transformWorkspace', () => {
  const raw: RawNutcacheOrganization = {
    id: 55,
    guid: 'abc-123',
    name: 'Acme Corp',
    email: 'admin@acme.example',
    phone: '+1-555-0100',
    website: 'https://acme.example',
    address: '100 Main St',
    city: 'Springfield',
    zip_code: '62701',
    status: 0,
    active_user_count: 12,
    logo_url: 'https://acme.example/logo.png',
    is_owner: true,
  }

  it('maps id and name', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('55')
    expect(result.name).toBe('Acme Corp')
  })

  it('externalId equals id', () => {
    const result = transformWorkspace(raw)
    expect(result.externalId).toBe('55')
  })

  it('platform is nutcache', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('nutcache')
  })

  it('metadata includes guid and city', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.guid).toBe('abc-123')
    expect(result.metadata.city).toBe('Springfield')
  })

  it('metadata includes activeUserCount and isOwner', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.activeUserCount).toBe('12')
    expect(result.metadata.isOwner).toBe('true')
  })

  it('name defaults to empty string when absent', () => {
    const result = transformWorkspace({ id: 1 })
    expect(result.name).toBe('')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
