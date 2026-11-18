import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawWeeekWorkspace,
} from '../../../../../../../src/verticals/projects/adapters/weeek/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('weeek transformWorkspace', () => {
  const raw: RawWeeekWorkspace = {
    id: 77,
    title: 'Acme Industries',
    description: 'Our main workspace.',
    isPersonal: false,
    logo: 'https://cdn.example.com/ws-logo.png',
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('77')
    expect(result.externalId).toBe('77')
  })

  it('maps name from title', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Acme Industries')
  })

  it('name defaults to empty string when title is absent', () => {
    const result = transformWorkspace({ id: 1 })
    expect(result.name).toBe('')
  })

  it('platform is weeek', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('weeek')
  })

  it('metadata.description reflects raw.description', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.description).toBe('Our main workspace.')
  })

  it('metadata.isPersonal reflects raw.isPersonal as string', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.isPersonal).toBe('false')
  })

  it('metadata.logo reflects raw.logo', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.logo).toBe('https://cdn.example.com/ws-logo.png')
  })

  it('metadata omits null fields', () => {
    const result = transformWorkspace({ ...raw, description: null, logo: null })
    expect(result.metadata.description).toBeUndefined()
    expect(result.metadata.logo).toBeUndefined()
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
