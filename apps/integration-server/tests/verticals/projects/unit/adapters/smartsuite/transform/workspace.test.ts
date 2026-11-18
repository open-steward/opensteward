import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawSmartsuiteAccount,
} from '../../../../../../../src/verticals/projects/adapters/smartsuite/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('smartsuite transformWorkspace', () => {
  const raw: RawSmartsuiteAccount = {
    id: 'acct_001',
    name: 'Acme Engineering',
    slug: 'acme-engineering',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('acct_001')
    expect(result.externalId).toBe('acct_001')
  })

  it('maps name from raw.name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Acme Engineering')
  })

  it('name falls back to id when name is null', () => {
    const result = transformWorkspace({ id: 'acct_001', name: null })
    expect(result.name).toBe('acct_001')
  })

  it('stores slug in metadata', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.slug).toBe('acme-engineering')
  })

  it('platform is smartsuite', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('smartsuite')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
