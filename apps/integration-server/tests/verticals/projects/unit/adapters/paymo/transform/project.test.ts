import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawPaymoProject,
} from '../../../../../../../src/verticals/projects/adapters/paymo/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

const baseRaw: RawPaymoProject = {
  id: 201,
  name: 'Acme Website Redesign',
  description: 'Full redesign of Acme public website.',
  active: true,
  managers: [11, 22],
  users: [11, 22, 33],
  client_id: 5,
  status_id: 2,
  color: '#ff0000',
  billable: true,
  created_on: '2024-01-15T12:00:00.000Z',
  updated_on: '2024-02-01T09:00:00.000Z',
}

describe('transformProject', () => {
  it('maps id and externalId as stringified numeric id', () => {
    const result = transformProject(baseRaw)
    expect(result.id).toBe('201')
    expect(result.externalId).toBe('201')
  })

  it('maps name from name field', () => {
    const result = transformProject(baseRaw)
    expect(result.name).toBe('Acme Website Redesign')
  })

  it('maps description from description field', () => {
    const result = transformProject(baseRaw)
    expect(result.description).toBe('Full redesign of Acme public website.')
  })

  it('sets status to active when active is true', () => {
    const result = transformProject({ ...baseRaw, active: true })
    expect(result.status).toBe('active')
  })

  it('sets status to archived when active is false', () => {
    const result = transformProject({ ...baseRaw, active: false })
    expect(result.status).toBe('archived')
  })

  it('defaults status to active when active is undefined', () => {
    const raw: RawPaymoProject = { ...baseRaw, active: undefined }
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('maps ownerId from first element of managers array', () => {
    const result = transformProject(baseRaw)
    expect(result.ownerId).toBe('11')
  })

  it('leaves ownerId undefined when managers array is empty', () => {
    const result = transformProject({ ...baseRaw, managers: [] })
    expect(result.ownerId).toBeUndefined()
  })

  it('sets workspaceId to empty string (no workspace concept in Paymo)', () => {
    const result = transformProject(baseRaw)
    expect(result.workspaceId).toBe('')
  })

  it('sets platform to paymo', () => {
    const result = transformProject(baseRaw)
    expect(result.platform).toBe('paymo')
  })

  it('maps createdAt from created_on as ISO string', () => {
    const result = transformProject(baseRaw)
    expect(result.createdAt).toBe(new Date('2024-01-15T12:00:00.000Z').toISOString())
  })

  it('maps updatedAt from updated_on as ISO string', () => {
    const result = transformProject(baseRaw)
    expect(result.updatedAt).toBe(new Date('2024-02-01T09:00:00.000Z').toISOString())
  })

  it('surfaces clientId and color in metadata', () => {
    const result = transformProject(baseRaw)
    expect(result.metadata).toMatchObject({ clientId: '5', color: '#ff0000' })
  })

  it('produces output that passes ProjectSchema validation', () => {
    const result = transformProject(baseRaw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
