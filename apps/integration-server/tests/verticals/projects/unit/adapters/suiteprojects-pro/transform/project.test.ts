import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawSuiteProjectsProject,
} from '../../../../../../../src/verticals/projects/adapters/suiteprojects-pro/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('suiteprojects-pro transformProject', () => {
  const raw: RawSuiteProjectsProject = {
    id: 101,
    name: 'Website Redesign',
    notes: 'Redesign the corporate website.',
    isActive: true,
    userId: 42,
    customerId: 7,
    startDate: '2026-01-01',
    finishDate: '2026-06-30',
    created: '2026-01-01T09:00:00Z',
    updated: '2026-03-15T12:00:00Z',
    currency: 'USD',
    budget: 1234.56,
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
  })

  it('maps workspaceId from customerId', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('7')
  })

  it('maps name and description from notes', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Website Redesign')
    expect(result.description).toBe('Redesign the corporate website.')
  })

  it('status is active when isActive is true', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived when isActive is false', () => {
    const result = transformProject({ ...raw, isActive: false })
    expect(result.status).toBe('archived')
  })

  it('status is archived when isActive is 0', () => {
    const result = transformProject({ ...raw, isActive: 0 })
    expect(result.status).toBe('archived')
  })

  it('maps ownerId from userId', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('42')
  })

  it('ownerId is undefined when userId is absent', () => {
    const result = transformProject({ id: 1 })
    expect(result.ownerId).toBeUndefined()
  })

  it('workspaceId is empty string when customerId is absent', () => {
    const result = transformProject({ id: 1 })
    expect(result.workspaceId).toBe('')
  })

  it('stores budget in minor units (cents) in metadata', () => {
    const result = transformProject(raw)
    expect(result.metadata.budgetMinorUnits).toBe('123456')
  })

  it('stores currency in metadata', () => {
    const result = transformProject(raw)
    expect(result.metadata.currency).toBe('USD')
  })

  it('platform is suiteprojects-pro', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('suiteprojects-pro')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
