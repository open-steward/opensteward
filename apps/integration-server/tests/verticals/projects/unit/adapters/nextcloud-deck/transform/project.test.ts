import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawNextcloudDeckBoard,
} from '../../../../../../../src/verticals/projects/adapters/nextcloud-deck/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('nextcloud-deck transformProject', () => {
  const raw: RawNextcloudDeckBoard = {
    id: 12,
    title: 'Sprint Board',
    color: '0082c9',
    archived: false,
    owner: { uid: 'admin', displayname: 'Admin User' },
    lastModified: 1746057600, // 2026-05-01T00:00:00Z
  }

  it('maps id and externalId as string of numeric id', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('12')
    expect(result.externalId).toBe('12')
  })

  it('maps name from title', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Sprint Board')
  })

  it('workspaceId is empty string (no workspace concept)', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('')
  })

  it('status is active when archived is false', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived when archived is true', () => {
    const result = transformProject({ ...raw, archived: true })
    expect(result.status).toBe('archived')
  })

  it('ownerId maps from owner.uid', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('admin')
  })

  it('createdAt and updatedAt both come from lastModified Unix timestamp', () => {
    const result = transformProject(raw)
    const expected = new Date(1746057600 * 1000).toISOString()
    expect(result.createdAt).toBe(expected)
    expect(result.updatedAt).toBe(expected)
  })

  it('platform is nextcloud-deck', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('nextcloud-deck')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformProject({ id: 99 })
    expect(result.id).toBe('99')
    expect(result.name).toBe('')
    expect(result.status).toBe('active')
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
