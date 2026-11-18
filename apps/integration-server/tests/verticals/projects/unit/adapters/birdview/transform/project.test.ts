/**
 * Fixture fields are the ProjectModel / ProjectStatus properties declared in
 * https://app.go.easyprojects.net/api/swagger/v2/swagger.json (the spec ships
 * no example bodies, so values are typed per the schema).
 */
import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawBirdviewProject,
  type RawBirdviewProjectStatus,
} from '../../../../../../../src/verticals/projects/adapters/birdview/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

const raw: RawBirdviewProject = {
  ProjectId: 123,
  Name: 'Website Redesign',
  Description: '<p>Full redesign</p>',
  PlainTextDescription: 'Full redesign',
  CreatorId: 77,
  StartDate: '2025-02-01T00:00:00Z',
  EndDate: '2025-08-01T00:00:00Z',
  ActCompletionDate: null,
  Progress: 40,
  SpaceId: 9,
  StatusId: 2,
  PriorityId: 1,
  CustomerId: null,
  PortfolioId: 5,
  CreationDate: '2025-01-15T09:00:00Z',
  LastModificationDate: '2025-03-01T10:00:00Z',
  IsArchived: false,
  CustomFields: {},
  ProjectMembers: [],
}

const status = (over: Partial<RawBirdviewProjectStatus> = {}): RawBirdviewProjectStatus => ({
  ProjectStatusId: 2,
  Name: 'Open',
  WorkflowId: 1,
  TreatAsCompleted: false,
  IsTemplate: false,
  IsDraftStatus: false,
  WorkflowIn: true,
  WorkflowOut: false,
  ...over,
})

describe('birdview transformProject', () => {
  it('maps the documented ProjectModel fields and passes ProjectSchema', () => {
    const p = ProjectSchema.parse(transformProject(raw, 'acme', status()))
    expect(p).toMatchObject({
      id: '123',
      externalId: '123',
      workspaceId: 'acme',
      name: 'Website Redesign',
      description: '<p>Full redesign</p>',
      status: 'active',
      startDate: '2025-02-01T00:00:00.000Z',
      endDate: '2025-08-01T00:00:00.000Z',
      createdAt: '2025-01-15T09:00:00.000Z',
      updatedAt: '2025-03-01T10:00:00.000Z',
      platform: 'birdview',
    })
    expect(p.ownerId).toBeUndefined()
    expect(p.metadata).toEqual({
      statusId: '2',
      statusName: 'Open',
      spaceId: '9',
      portfolioId: '5',
      creatorId: '77',
      isArchived: 'false',
    })
  })

  it('status comes from the status row flags', () => {
    expect(
      ProjectSchema.parse(transformProject(raw, 'acme', status({ TreatAsCompleted: true }))).status,
    ).toBe('completed')
    expect(
      ProjectSchema.parse(transformProject(raw, 'acme', status({ IsDraftStatus: true }))).status,
    ).toBe('unknown')
    expect(
      ProjectSchema.parse(transformProject(raw, 'acme', status({ IsTemplate: true }))).status,
    ).toBe('unknown')
    expect(ProjectSchema.parse(transformProject(raw, 'acme', undefined)).status).toBe('unknown')
  })

  it('IsArchived overrides the status row', () => {
    const p = ProjectSchema.parse(transformProject({ ...raw, IsArchived: true }, 'acme', status()))
    expect(p.status).toBe('archived')
  })

  it('reads ProjectId, never Id', () => {
    const noId = { ...raw, Id: 5 } as unknown as RawBirdviewProject
    delete (noId as Record<string, unknown>)['ProjectId']
    expect(() => transformProject(noId, 'acme', status())).toThrow(/ProjectId/)
  })
})
