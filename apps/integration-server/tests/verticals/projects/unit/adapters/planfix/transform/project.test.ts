import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawPlanfixProject,
} from '../../../../../../../src/verticals/projects/adapters/planfix/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('planfix transformProject', () => {
  const raw: RawPlanfixProject = {
    id: 42,
    name: 'Acme Onboarding',
    description: 'Onboard Acme onto the platform',
    status: { id: 3 },
    owner: { id: 'user:7', name: 'Jane' },
    parent: { id: 10 },
    counterparty: { id: 'contact:5' },
    startDate: { datetime: '2026-01-15T09:30:00.000Z' },
    endDate: { datetime: '2026-03-01T00:00:00.000Z' },
    overdue: false,
    isDeleted: false,
  }

  it('maps id and externalId to string of raw numeric id', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps name from raw.name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Acme Onboarding')
  })

  it('maps description from raw.description', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Onboard Acme onto the platform')
  })

  it('status is active when isDeleted is false', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived when isDeleted is true', () => {
    const result = transformProject({ ...raw, isDeleted: true })
    expect(result.status).toBe('archived')
  })

  it('ownerId from owner.id (namespaced string)', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('user:7')
  })

  it('ownerId is undefined when owner is absent', () => {
    const result = transformProject({ ...raw, owner: undefined })
    expect(result.ownerId).toBeUndefined()
  })

  it('startDate parsed from timepoint datetime field', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBe('2026-01-15T09:30:00.000Z')
  })

  it('endDate parsed from timepoint datetime field', () => {
    const result = transformProject(raw)
    expect(result.endDate).toBe('2026-03-01T00:00:00.000Z')
  })

  it('startDate falls back to date field when datetime absent', () => {
    const result = transformProject({ ...raw, startDate: { date: '2026-01-15' } })
    expect(result.startDate).toBe('2026-01-15T00:00:00.000Z')
  })

  it('workspaceId is empty string (single-account platform)', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('')
  })

  it('metadata.statusId contains status.id as string', () => {
    const result = transformProject(raw)
    expect(result.metadata.statusId).toBe('3')
  })

  it('metadata.counterpartyId contains counterparty id', () => {
    const result = transformProject(raw)
    expect(result.metadata.counterpartyId).toBe('contact:5')
  })

  it('metadata.parentId contains parent id as string', () => {
    const result = transformProject(raw)
    expect(result.metadata.parentId).toBe('10')
  })

  it('platform is planfix', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('planfix')
  })

  it('raw is preserved on output', () => {
    const result = transformProject(raw)
    expect(result.raw).toBe(raw)
  })

  it('name defaults to empty string when raw.name absent', () => {
    const result = transformProject({ id: 1 })
    expect(result.name).toBe('')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
