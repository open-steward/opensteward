import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawQuickbaseApp,
} from '../../../../../../../src/verticals/projects/adapters/quickbase/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('quickbase transformWorkspace', () => {
  const raw: RawQuickbaseApp = {
    id: 'bqbtz9iy4',
    name: 'Acme Project Tracker',
    description: 'Central tracker for all Acme projects.',
    created: '2024-01-15T10:00:00.000Z',
    updated: '2024-06-01T08:00:00.000Z',
    timeZone: 'America/New_York',
    dateFormat: 'MM-DD-YYYY',
    hasEveryoneOnTheInternet: false,
  }

  it('maps id from raw.id', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('bqbtz9iy4')
  })

  it('maps externalId from raw.id', () => {
    const result = transformWorkspace(raw)
    expect(result.externalId).toBe('bqbtz9iy4')
  })

  it('maps name from raw.name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Acme Project Tracker')
  })

  it('platform is quickbase', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('quickbase')
  })

  it('metadata includes timeZone', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.timeZone).toBe('America/New_York')
  })

  it('metadata includes dateFormat', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.dateFormat).toBe('MM-DD-YYYY')
  })

  it('metadata includes description', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.description).toBe('Central tracker for all Acme projects.')
  })

  it('metadata includes hasEveryoneOnTheInternet as string', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.hasEveryoneOnTheInternet).toBe('false')
  })

  it('name is empty string when raw.name is absent', () => {
    const result = transformWorkspace({ id: 'bqbtz9iy4' })
    expect(result.name).toBe('')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
