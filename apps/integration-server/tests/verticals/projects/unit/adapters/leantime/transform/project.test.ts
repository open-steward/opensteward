import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawLeantimeProject,
} from '../../../../../../../src/verticals/projects/adapters/leantime/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('leantime transformProject', () => {
  const raw: RawLeantimeProject = {
    id: 7,
    name: 'Mobile App',
    description: 'Build the mobile application',
    state: 'open',
    status: 'active',
    psUserId: 3,
    clientId: 10,
    clientName: 'Acme Corp',
    start: '2024-01-01T00:00:00.000Z',
    end: '2024-12-31T00:00:00.000Z',
    created: '2024-01-01T09:00:00.000Z',
    modified: '2024-06-15T12:00:00.000Z',
    type: 'software',
  }

  it('maps id as string', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
  })

  it('maps name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Mobile App')
  })

  it('maps description', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Build the mobile application')
  })

  it('maps psUserId to ownerId', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('3')
  })

  it('status is active for state=open', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived for state=archived', () => {
    const result = transformProject({ ...raw, state: 'archived' })
    expect(result.status).toBe('archived')
  })

  it('status is closed for state=closed', () => {
    const result = transformProject({ ...raw, state: 'closed' })
    expect(result.status).toBe('closed')
  })

  it('status is on_hold for state=on_hold', () => {
    const result = transformProject({ ...raw, state: 'on_hold' })
    expect(result.status).toBe('on_hold')
  })

  it('maps startDate and endDate', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBe('2024-01-01T00:00:00.000Z')
    expect(result.endDate).toBe('2024-12-31T00:00:00.000Z')
  })

  it('maps createdAt from created and updatedAt from modified', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2024-01-01T09:00:00.000Z')
    expect(result.updatedAt).toBe('2024-06-15T12:00:00.000Z')
  })

  it('workspaceId is empty string (no workspace concept)', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('')
  })

  it('platform is leantime', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('leantime')
  })

  it('metadata contains clientId, clientName, type', () => {
    const result = transformProject(raw)
    expect(result.metadata.clientId).toBe('10')
    expect(result.metadata.clientName).toBe('Acme Corp')
    expect(result.metadata.type).toBe('software')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it('ownerId is undefined when psUserId absent', () => {
    const result = transformProject({ ...raw, psUserId: undefined })
    expect(result.ownerId).toBeUndefined()
  })
})
