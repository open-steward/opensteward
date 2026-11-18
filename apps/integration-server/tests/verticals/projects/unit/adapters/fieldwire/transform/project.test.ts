import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawFieldwireProject,
} from '../../../../../../../src/verticals/projects/adapters/fieldwire/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('fieldwire transformProject', () => {
  const raw: RawFieldwireProject = {
    id: 'proj-uuid-001',
    name: 'Downtown Office Build',
    code: 'DOB-2026',
    color: '#ff6600',
    account_id: 4321,
    created_at: '2026-01-10T08:00:00Z',
    updated_at: '2026-03-15T12:30:00Z',
    deleted_at: null,
    plan_name: 'enterprise',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('proj-uuid-001')
    expect(result.externalId).toBe('proj-uuid-001')
  })

  it('maps name correctly', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Downtown Office Build')
  })

  it('maps workspaceId as stringified account_id', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('4321')
  })

  it('status is active when deleted_at is null', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived when deleted_at is present', () => {
    const archived: RawFieldwireProject = { ...raw, deleted_at: '2026-04-01T00:00:00Z' }
    const result = transformProject(archived)
    expect(result.status).toBe('archived')
  })

  it('platform is fieldwire', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('fieldwire')
  })

  it('maps metadata fields: code, color, planName', () => {
    const result = transformProject(raw)
    expect(result.metadata.code).toBe('DOB-2026')
    expect(result.metadata.color).toBe('#ff6600')
    expect(result.metadata.planName).toBe('enterprise')
  })

  it('maps createdAt and updatedAt as ISO strings', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2026-01-10T08:00:00.000Z')
    expect(result.updatedAt).toBe('2026-03-15T12:30:00.000Z')
  })

  it('workspaceId is empty string when account_id is absent', () => {
    const result = transformProject({ id: 'proj-no-account' })
    expect(result.workspaceId).toBe('')
  })

  it('workspaceId handles string account_id', () => {
    const result = transformProject({ id: 'proj-str-acct', account_id: '9999' })
    expect(result.workspaceId).toBe('9999')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
