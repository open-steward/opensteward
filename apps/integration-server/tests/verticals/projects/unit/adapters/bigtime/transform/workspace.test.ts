import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawBigtimeFirm,
} from '../../../../../../../src/verticals/projects/adapters/bigtime/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('bigtime transformWorkspace', () => {
  const raw: RawBigtimeFirm = {
    id: 'firm_99',
    name: 'Acme Construction LLC',
  }

  it('maps id from firm id', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('firm_99')
    expect(result.externalId).toBe('firm_99')
  })

  it('maps name from firm name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Acme Construction LLC')
  })

  it('falls back to id string when name absent', () => {
    const result = transformWorkspace({ id: 'firm_99' })
    expect(result.name).toBe('firm_99')
  })

  it('platform is bigtime', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('bigtime')
  })

  it('metadata includes firmId', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.firmId).toBe('firm_99')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
