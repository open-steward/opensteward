/**
 * Fixture built from the public schema's `Workspace` type
 * (https://developers.zenhub.com/schema/zenhub-public-api.graphql):
 * `id: ID!  name: String  displayName: String!  description: String`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawZenhubWorkspace,
} from '../../../../../../../src/verticals/projects/adapters/zenhub/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('zenhub transformWorkspace', () => {
  const raw: RawZenhubWorkspace = {
    id: '66f9da05d91f86002fbd3023',
    name: 'Acme Engineering',
    displayName: 'Acme Engineering',
    description: 'Main engineering workspace',
  }

  it('maps the documented fields and parses with WorkspaceSchema', () => {
    const result = WorkspaceSchema.parse(transformWorkspace(raw))
    expect(result).toMatchObject({
      id: '66f9da05d91f86002fbd3023',
      externalId: '66f9da05d91f86002fbd3023',
      name: 'Acme Engineering',
      platform: 'zenhub',
      metadata: { name: 'Acme Engineering', description: 'Main engineering workspace' },
    })
  })

  it('name reads the non-null displayName, not the nullable name', () => {
    const result = WorkspaceSchema.parse(
      transformWorkspace({ ...raw, name: null, displayName: 'Shown Name', description: null }),
    )
    expect(result.name).toBe('Shown Name')
    expect(result.metadata).toEqual({})
  })
})
