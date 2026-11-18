import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawTapdWorkspace,
} from '../../../../../../../src/verticals/projects/adapters/tapd/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('tapd transformWorkspace', () => {
  const raw: RawTapdWorkspace = {
    id: 'ws_12345',
    name: 'tapd-workspace',
    pretty_name: 'TAPD Workspace',
    description: 'Top-level company workspace.',
    status: 'active',
    category: 'software',
    creator: 'alice',
    created: '2025-01-01T00:00:00.000Z',
    begin_date: '2025-01-02',
    end_date: '2025-12-31',
    company_id: 'co_999',
    parent_id: '0',
  }

  it('maps id and externalId from string id', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('ws_12345')
    expect(result.externalId).toBe('ws_12345')
  })

  it('prefers pretty_name over name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('TAPD Workspace')
  })

  it('falls back to name when pretty_name is absent', () => {
    const result = transformWorkspace({ ...raw, pretty_name: undefined })
    expect(result.name).toBe('tapd-workspace')
  })

  it('stores status in metadata', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.status).toBe('active')
  })

  it('stores category in metadata', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.category).toBe('software')
  })

  it('stores creator in metadata', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.creator).toBe('alice')
  })

  it('stores companyId in metadata', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.companyId).toBe('co_999')
  })

  it('platform is tapd', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('tapd')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
