import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawKantataWorkspace,
} from '../../../../../../../src/verticals/projects/adapters/kantata/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('kantata transformProject', () => {
  const raw: RawKantataWorkspace = {
    id: 'ws-123',
    title: 'Client Onboarding',
    description: 'Onboard new enterprise clients',
    archived: false,
    account_id: 'acct-9',
    creator_id: 'usr-7',
    due_date: '2024-12-31T00:00:00.000Z',
    start_date: '2024-01-01T00:00:00.000Z',
    created_at: '2024-01-01T09:00:00.000Z',
    updated_at: '2024-06-15T12:00:00.000Z',
    percentage_complete: 50,
    currency: 'USD',
    status: { message: 'On Track', color: 'green', key: 'on_track' },
  }

  it('maps id', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('ws-123')
    expect(result.externalId).toBe('ws-123')
  })

  it('maps title to name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Client Onboarding')
  })

  it('maps account_id to workspaceId', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('acct-9')
  })

  it('maps creator_id to ownerId', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('usr-7')
  })

  it('status is active when not archived and < 100%', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived when archived=true', () => {
    const result = transformProject({ ...raw, archived: true })
    expect(result.status).toBe('archived')
  })

  it('status is completed when percentage_complete=100', () => {
    const result = transformProject({ ...raw, percentage_complete: 100 })
    expect(result.status).toBe('completed')
  })

  it('maps startDate and endDate from start_date and due_date', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBe('2024-01-01T00:00:00.000Z')
    expect(result.endDate).toBe('2024-12-31T00:00:00.000Z')
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2024-01-01T09:00:00.000Z')
    expect(result.updatedAt).toBe('2024-06-15T12:00:00.000Z')
  })

  it('platform is kantata', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('kantata')
  })

  it('metadata contains currency and statusMessage', () => {
    const result = transformProject(raw)
    expect(result.metadata.currency).toBe('USD')
    expect(result.metadata.statusMessage).toBe('On Track')
    expect(result.metadata.statusKey).toBe('on_track')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
