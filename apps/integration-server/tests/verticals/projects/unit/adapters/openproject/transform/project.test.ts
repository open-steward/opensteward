import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawOpenProjectProject,
} from '../../../../../../../src/verticals/projects/adapters/openproject/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('openproject transformProject', () => {
  const raw: RawOpenProjectProject = {
    _type: 'Project',
    id: 10,
    identifier: 'my-project',
    name: 'My Project',
    active: true,
    public: false,
    description: {
      format: 'markdown',
      raw: 'A project description.',
      html: '<p>A project description.</p>',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    _links: {
      status: { href: '/api/v3/project_statuses/on_track', title: 'On track' },
      parent: { href: '/api/v3/projects/5', title: 'Parent Project' },
    },
  }

  it('maps id and name', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('10')
    expect(result.name).toBe('My Project')
  })

  it('maps description from description.raw', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('A project description.')
  })

  it('workspaceId is always empty string', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('')
  })

  it('status is active when active=true and status code is on_track', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived when active=false', () => {
    const result = transformProject({ ...raw, active: false })
    expect(result.status).toBe('archived')
  })

  it('status is completed when status link is "finished"', () => {
    const result = transformProject({
      ...raw,
      _links: { status: { href: '/api/v3/project_statuses/finished', title: 'Finished' } },
    })
    expect(result.status).toBe('completed')
  })

  it('status is on_hold when status link is "at_risk"', () => {
    const result = transformProject({
      ...raw,
      _links: { status: { href: '/api/v3/project_statuses/at_risk', title: 'At risk' } },
    })
    expect(result.status).toBe('on_hold')
  })

  it('status is on_hold when status link is "off_track"', () => {
    const result = transformProject({
      ...raw,
      _links: { status: { href: '/api/v3/project_statuses/off_track', title: 'Off track' } },
    })
    expect(result.status).toBe('on_hold')
  })

  it('maps createdAt', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('platform is openproject', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('openproject')
  })

  it('metadata includes identifier and parentId', () => {
    const result = transformProject(raw)
    expect(result.metadata.identifier).toBe('my-project')
    expect(result.metadata.parentId).toBe('5')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
