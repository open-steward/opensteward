import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawBaserowWorkspace,
} from '../../../../../../../src/verticals/projects/adapters/baserow/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('baserow transformWorkspace', () => {
  const raw: RawBaserowWorkspace = {
    id: 7,
    name: 'Acme Workspace',
    permissions: 'ADMIN',
    users: [
      { id: 1, name: 'Alice', email: 'alice@example.com', permissions: 'ADMIN' },
      { id: 2, name: 'Bob', email: 'bob@example.com', permissions: 'MEMBER' },
    ],
  }

  it('maps id and name', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('7')
    expect(result.name).toBe('Acme Workspace')
  })

  it('platform is baserow', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('baserow')
  })

  it('metadata includes permissions and memberCount', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.permissions).toBe('ADMIN')
    expect(result.metadata.memberCount).toBe('2')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
