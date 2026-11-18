import { describe, it, expect } from 'vitest'
import { transformWorkspace } from '../../../../../../../src/verticals/projects/adapters/huly/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

const WS = '3f2c9a4e-8d1b-4c6f-9e2a-5b7d1c0f4e88'

describe('transformWorkspace', () => {
  it('parses against WorkspaceSchema with the connection UUID as id and name', () => {
    expect(WorkspaceSchema.parse(transformWorkspace(WS))).toMatchObject({
      id: WS,
      externalId: WS,
      name: WS,
      platform: 'huly',
      metadata: {},
    })
  })
})
