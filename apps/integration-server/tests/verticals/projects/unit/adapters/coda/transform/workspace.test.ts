import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawCodaWorkspace,
} from '../../../../../../../src/verticals/projects/adapters/coda/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('coda transformWorkspace', () => {
  const raw: RawCodaWorkspace = {
    id: 'ws-xyz',
    type: 'workspace',
    name: 'Acme Industries',
    organizationId: 'org-acme',
    browserLink: 'https://coda.io/workspaces/ws-xyz',
    description: 'Main Acme workspace.',
  }

  it('maps id and externalId directly from workspace id', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('ws-xyz')
    expect(result.externalId).toBe('ws-xyz')
  })

  it('maps name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Acme Industries')
  })

  it('platform is coda', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('coda')
  })

  it('metadata.organizationId reflects organizationId', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.organizationId).toBe('org-acme')
  })

  it('metadata.description reflects description', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.description).toBe('Main Acme workspace.')
  })

  it('name is empty string when absent', () => {
    const result = transformWorkspace({ id: 'ws-1' })
    expect(result.name).toBe('')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
