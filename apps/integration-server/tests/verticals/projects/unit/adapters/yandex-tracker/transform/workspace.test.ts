import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawYandexTrackerQueue,
} from '../../../../../../../src/verticals/projects/adapters/yandex-tracker/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('yandex-tracker transformWorkspace', () => {
  const raw: RawYandexTrackerQueue = {
    id: 'queue-1',
    key: 'PROJ',
    name: 'Project Queue',
    description: 'Queue for all project issues',
    lead: { id: 'user-1', display: 'Alice' },
    assignAuto: true,
  }

  it('maps id as string', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('queue-1')
  })

  it('uses key as externalId when present', () => {
    const result = transformWorkspace(raw)
    expect(result.externalId).toBe('PROJ')
  })

  it('falls back to id string as externalId when key absent', () => {
    const result = transformWorkspace({ ...raw, key: undefined })
    expect(result.externalId).toBe('queue-1')
  })

  it('maps name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Project Queue')
  })

  it('falls back to key when name absent', () => {
    const result = transformWorkspace({ ...raw, name: undefined })
    expect(result.name).toBe('PROJ')
  })

  it('name is empty string when both name and key absent', () => {
    const result = transformWorkspace({ ...raw, name: undefined, key: undefined })
    expect(result.name).toBe('')
  })

  it('platform is yandex-tracker', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('yandex-tracker')
  })

  it('metadata includes key and description', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.key).toBe('PROJ')
    expect(result.metadata.description).toBe('Queue for all project issues')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
