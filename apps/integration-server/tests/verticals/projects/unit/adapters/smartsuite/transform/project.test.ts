import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawSmartsuiteSolution,
} from '../../../../../../../src/verticals/projects/adapters/smartsuite/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('smartsuite transformProject', () => {
  const raw: RawSmartsuiteSolution = {
    id: 'sol_001',
    name: 'Product Roadmap',
    description: { preview: 'Annual product roadmap.', html: '<p>Annual product roadmap.</p>' },
    status: 'active',
    created: '2026-01-05T10:00:00.000Z',
    updated: '2026-03-10T15:00:00.000Z',
    created_by: 'mem_alice',
    logo_color: '#4f46e5',
    logo_icon: 'rocket',
    records_count: 42,
    applications_count: 5,
    members_count: 8,
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('sol_001')
    expect(result.externalId).toBe('sol_001')
  })

  it('maps name from raw.name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Product Roadmap')
  })

  it('description prefers preview over html', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Annual product roadmap.')
  })

  it('description falls back to html when preview absent', () => {
    const result = transformProject({ ...raw, description: { html: '<p>Only HTML</p>' } })
    expect(result.description).toBe('<p>Only HTML</p>')
  })

  it('description is undefined when description is null', () => {
    const result = transformProject({ ...raw, description: null })
    expect(result.description).toBeUndefined()
  })

  it('status active maps to active', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status archived when status is "archived"', () => {
    const result = transformProject({ ...raw, status: 'archived' })
    expect(result.status).toBe('archived')
  })

  it('status archived when status is "deleted"', () => {
    const result = transformProject({ ...raw, status: 'deleted' })
    expect(result.status).toBe('archived')
  })

  it('status completed when status is "completed"', () => {
    const result = transformProject({ ...raw, status: 'completed' })
    expect(result.status).toBe('completed')
  })

  it('status on_hold when status is "on_hold"', () => {
    const result = transformProject({ ...raw, status: 'on_hold' })
    expect(result.status).toBe('on_hold')
  })

  it('status on_hold when status is "paused"', () => {
    const result = transformProject({ ...raw, status: 'paused' })
    expect(result.status).toBe('on_hold')
  })

  it('workspaceId is always empty string', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('')
  })

  it('maps ownerId from created_by', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('mem_alice')
  })

  it('maps createdAt from created', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2026-01-05T10:00:00.000Z')
  })

  it('maps updatedAt from updated', () => {
    const result = transformProject(raw)
    expect(result.updatedAt).toBe('2026-03-10T15:00:00.000Z')
  })

  it('stores logoColor and logoIcon in metadata', () => {
    const result = transformProject(raw)
    expect(result.metadata.logoColor).toBe('#4f46e5')
    expect(result.metadata.logoIcon).toBe('rocket')
  })

  it('platform is smartsuite', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('smartsuite')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
