import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawArtiaFolder,
} from '../../../../../../../src/verticals/projects/adapters/artia/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('artia transformProject', () => {
  const raw: RawArtiaFolder = {
    id: '33',
    name: 'Product Launch',
    description: 'Launch the new product.',
    status: 'active',
    createdAt: '2024-03-01T08:00:00Z',
    updatedAt: '2024-04-01T08:00:00Z',
    accountId: '99',
  }

  it('maps id and externalId from string id', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('33')
    expect(result.externalId).toBe('33')
  })

  it('maps workspaceId from accountId', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('99')
  })

  it('maps name and description', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Product Launch')
    expect(result.description).toBe('Launch the new product.')
  })

  it('status is active for status="active"', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived for status="archived"', () => {
    const result = transformProject({ ...raw, status: 'archived' })
    expect(result.status).toBe('archived')
  })

  it('status is archived for status="inactive"', () => {
    const result = transformProject({ ...raw, status: 'inactive' })
    expect(result.status).toBe('archived')
  })

  it('status is archived for status="closed"', () => {
    const result = transformProject({ ...raw, status: 'closed' })
    expect(result.status).toBe('archived')
  })

  it('status is on_hold for status="on_hold"', () => {
    const result = transformProject({ ...raw, status: 'on_hold' })
    expect(result.status).toBe('on_hold')
  })

  it('status is on_hold for status="paused"', () => {
    const result = transformProject({ ...raw, status: 'paused' })
    expect(result.status).toBe('on_hold')
  })

  it('ownerId is always undefined (Artia folder has no owner field)', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBeUndefined()
  })

  it('startDate and endDate are always undefined', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBeUndefined()
    expect(result.endDate).toBeUndefined()
  })

  it('createdAt maps from ISO string', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2024-03-01T08:00:00.000Z')
  })

  it('platform is artia', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('artia')
  })

  it('metadata.rawStatus reflects raw status string', () => {
    const result = transformProject(raw)
    expect(result.metadata.rawStatus).toBe('active')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it('workspaceId is empty string when accountId is absent', () => {
    const result = transformProject({ id: '1', name: 'Test' })
    expect(result.workspaceId).toBe('')
  })

  it('status defaults to active for unknown status values', () => {
    const result = transformProject({ ...raw, status: 'unknown-status' })
    expect(result.status).toBe('active')
  })
})
