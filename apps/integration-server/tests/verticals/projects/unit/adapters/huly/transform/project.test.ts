/**
 * Fixture fields follow the documented interfaces (Huly publishes no example
 * response): tracker `Project` (hcengineering/platform plugins/tracker) over
 * core `Space`/`Doc` (hcengineering/huly.core packages/core/src/classes.ts).
 */
import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawHulyProject,
} from '../../../../../../../src/verticals/projects/adapters/huly/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

const WS = '3f2c9a4e-8d1b-4c6f-9e2a-5b7d1c0f4e88'

function makeRaw(overrides: Partial<RawHulyProject> = {}): RawHulyProject {
  return {
    _id: '67a1f0c2e4b0a1b2c3d4e5f6',
    _class: 'tracker:class:Project',
    space: 'core:space:Space',
    identifier: 'HULY',
    name: 'Huly Platform',
    description: 'Tracker project',
    private: false,
    archived: false,
    members: ['acc-1', 'acc-2'],
    owners: ['acc-1'],
    createdOn: 1700000000000,
    modifiedOn: 1700000100000,
    ...overrides,
  }
}

describe('transformProject', () => {
  it('parses against ProjectSchema', () => {
    const p = ProjectSchema.parse(transformProject(makeRaw(), WS, 'person-1'))
    expect(p).toMatchObject({
      id: '67a1f0c2e4b0a1b2c3d4e5f6',
      externalId: '67a1f0c2e4b0a1b2c3d4e5f6',
      workspaceId: WS,
      name: 'Huly Platform',
      description: 'Tracker project',
      status: 'active',
      ownerId: 'person-1',
      createdAt: '2023-11-14T22:13:20.000Z',
      updatedAt: '2023-11-14T22:15:00.000Z',
      platform: 'huly',
      metadata: { identifier: 'HULY', private: 'false', ownerAccountUuid: 'acc-1' },
    })
  })

  it('maps archived: true to archived', () => {
    expect(ProjectSchema.parse(transformProject(makeRaw({ archived: true }), WS)).status).toBe(
      'archived',
    )
  })

  it('keeps the owner account uuid in metadata, not in ownerId, when unresolved', () => {
    const p = ProjectSchema.parse(transformProject(makeRaw(), WS))
    expect(p.ownerId).toBeUndefined()
    expect(p.metadata['ownerAccountUuid']).toBe('acc-1')
  })

  it('has no ownerId when owners is absent', () => {
    expect(
      ProjectSchema.parse(transformProject(makeRaw({ owners: undefined }), WS)).ownerId,
    ).toBeUndefined()
  })

  it('omits an empty description and a missing createdOn', () => {
    const p = ProjectSchema.parse(
      transformProject(makeRaw({ description: '', createdOn: undefined }), WS),
    )
    expect(p.description).toBeUndefined()
    expect(p.createdAt).toBeUndefined()
  })
})
