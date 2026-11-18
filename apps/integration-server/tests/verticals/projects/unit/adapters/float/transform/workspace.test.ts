import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawFloatClient,
} from '../../../../../../../src/verticals/projects/adapters/float/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('float transformWorkspace', () => {
  const raw: RawFloatClient = {
    client_id: 42,
    name: 'Acme Industries',
  }

  it('maps client_id to id and externalId as string', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps name from raw.name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Acme Industries')
  })

  it('platform is float', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('float')
  })

  it('metadata is an empty record', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata).toEqual({})
  })

  it('name falls back to empty string when name is absent', () => {
    const result = transformWorkspace({ client_id: 5 })
    expect(result.name).toBe('')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })

  it('handles string client_id', () => {
    const result = transformWorkspace({ client_id: '99', name: 'Beta Corp' })
    expect(result.id).toBe('99')
    expect(result.name).toBe('Beta Corp')
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
