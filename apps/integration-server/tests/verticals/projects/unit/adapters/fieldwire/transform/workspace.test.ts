import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawFieldwireAccount,
} from '../../../../../../../src/verticals/projects/adapters/fieldwire/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('fieldwire transformWorkspace', () => {
  const raw: RawFieldwireAccount = {
    id: 4321,
    name: 'Acme Construction',
    plan_name: 'professional',
  }

  it('maps id as stringified integer', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('4321')
    expect(result.externalId).toBe('4321')
  })

  it('maps name correctly', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Acme Construction')
  })

  it('platform is fieldwire', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('fieldwire')
  })

  it('maps planName into metadata', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.planName).toBe('professional')
  })

  it('handles string id (stringifies it)', () => {
    const result = transformWorkspace({ id: '7777', name: 'String ID Corp' })
    expect(result.id).toBe('7777')
    expect(result.externalId).toBe('7777')
  })

  it('name is empty string when raw.name is null', () => {
    const result = transformWorkspace({ id: 1, name: null })
    expect(result.name).toBe('')
  })

  it('metadata has no planName key when plan_name is absent', () => {
    const result = transformWorkspace({ id: 1, name: 'No Plan' })
    expect(result.metadata.planName).toBeUndefined()
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
