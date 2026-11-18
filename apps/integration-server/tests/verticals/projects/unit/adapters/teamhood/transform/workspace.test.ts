import { describe, it, expect } from 'vitest'
import { transformWorkspace } from '../../../../../../../src/verticals/projects/adapters/teamhood/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'
import { DOC_WORKSPACES_RESPONSE } from '../fixtures'

describe('teamhood transformWorkspace (documented Entities.Workspace example)', () => {
  it('parses with WorkspaceSchema and maps the documented fields', () => {
    const w = WorkspaceSchema.parse(transformWorkspace(DOC_WORKSPACES_RESPONSE.workspaces[0]!))
    expect(w).toMatchObject({
      id: 'c2043582-4e71-4ba9-9a94-2f95048973b8',
      externalId: 'c2043582-4e71-4ba9-9a94-2f95048973b8',
      name: 'Workspace title',
      platform: 'teamhood',
      metadata: { displayId: 'WRKSPCE' },
    })
  })
})
