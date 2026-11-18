import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawCodaDoc,
} from '../../../../../../../src/verticals/projects/adapters/coda/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('coda transformProject', () => {
  const raw: RawCodaDoc = {
    id: 'doc-abc123',
    type: 'doc',
    name: 'Product Roadmap',
    owner: 'jane.doe@acme.example',
    ownerName: 'Jane Doe',
    workspaceId: 'ws-xyz',
    folderId: 'folder-1',
    createdAt: '2024-01-20T08:00:00.000Z',
    updatedAt: '2024-03-05T15:00:00.000Z',
    browserLink: 'https://coda.io/d/Product-Roadmap_dabc123',
    docSize: {
      totalRowCount: 500,
      tableAndViewCount: 12,
      pageCount: 8,
    },
  }

  it('maps id and externalId directly from doc id', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('doc-abc123')
    expect(result.externalId).toBe('doc-abc123')
  })

  it('maps workspaceId from workspaceId field', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('ws-xyz')
  })

  it('falls back to workspace.id when top-level workspaceId absent', () => {
    const docWithWorkspaceObj: RawCodaDoc = {
      ...raw,
      workspaceId: undefined,
      workspace: { id: 'ws-nested', name: 'Nested WS' },
    }
    const result = transformProject(docWithWorkspaceObj)
    expect(result.workspaceId).toBe('ws-nested')
  })

  it('maps name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Product Roadmap')
  })

  it('maps ownerId from owner (email)', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('jane.doe@acme.example')
  })

  it('status is always active (no archive flag on doc)', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('createdAt parses ISO datetime', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2024-01-20T08:00:00.000Z')
  })

  it('updatedAt parses ISO datetime', () => {
    const result = transformProject(raw)
    expect(result.updatedAt).toBe('2024-03-05T15:00:00.000Z')
  })

  it('platform is coda', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('coda')
  })

  it('metadata.ownerName reflects ownerName', () => {
    const result = transformProject(raw)
    expect(result.metadata.ownerName).toBe('Jane Doe')
  })

  it('metadata.pageCount reflects docSize.pageCount', () => {
    const result = transformProject(raw)
    expect(result.metadata.pageCount).toBe('8')
  })

  it('description is always undefined (no description field on Coda doc)', () => {
    const result = transformProject(raw)
    expect(result.description).toBeUndefined()
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
