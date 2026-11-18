import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawYandexTrackerProject,
} from '../../../../../../../src/verticals/projects/adapters/yandex-tracker/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('yandex-tracker transformProject', () => {
  const raw: RawYandexTrackerProject = {
    id: 'proj-42',
    key: 'PROJ',
    name: 'My Project',
    description: 'A sample project',
    lead: { id: 'user-1', display: 'Alice' },
    status: 'LAUNCHED',
    startDate: '2024-01-01T00:00:00.000Z',
    endDate: '2024-12-31T00:00:00.000Z',
  }

  it('maps id and externalId', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('proj-42')
    expect(result.externalId).toBe('proj-42')
  })

  it('maps name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('My Project')
  })

  it('falls back to key when name absent', () => {
    const result = transformProject({ ...raw, name: undefined })
    expect(result.name).toBe('PROJ')
  })

  it('name is empty string when both name and key absent', () => {
    const result = transformProject({ ...raw, name: undefined, key: undefined })
    expect(result.name).toBe('')
  })

  it('workspaceId is empty string (no workspace concept)', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('')
  })

  it('maps ownerId from lead.id', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('user-1')
  })

  it('ownerId is undefined when lead absent', () => {
    const result = transformProject({ ...raw, lead: null })
    expect(result.ownerId).toBeUndefined()
  })

  it('maps description', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('A sample project')
  })

  it('maps startDate and endDate', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBe('2024-01-01T00:00:00.000Z')
    expect(result.endDate).toBe('2024-12-31T00:00:00.000Z')
  })

  it('platform is yandex-tracker', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('yandex-tracker')
  })

  it('metadata includes key and trackerStatus', () => {
    const result = transformProject(raw)
    expect(result.metadata.key).toBe('PROJ')
    expect(result.metadata.trackerStatus).toBe('LAUNCHED')
  })

  describe('status mapping', () => {
    it('LAUNCHED maps to active', () => {
      const result = transformProject({ ...raw, status: 'LAUNCHED' })
      expect(result.status).toBe('active')
    })

    it('IN_PROGRESS maps to active', () => {
      const result = transformProject({ ...raw, status: 'IN_PROGRESS' })
      expect(result.status).toBe('active')
    })

    it('POSTPONED maps to on_hold', () => {
      const result = transformProject({ ...raw, status: 'POSTPONED' })
      expect(result.status).toBe('on_hold')
    })

    it('DRAFT maps to on_hold', () => {
      const result = transformProject({ ...raw, status: 'DRAFT' })
      expect(result.status).toBe('on_hold')
    })

    it('unknown status maps to active (default)', () => {
      const result = transformProject({ ...raw, status: 'UNKNOWN' })
      expect(result.status).toBe('active')
    })

    it('absent status maps to active (default)', () => {
      const result = transformProject({ ...raw, status: undefined })
      expect(result.status).toBe('active')
    })
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
