import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawCarerixNodeType,
  type RawCarerixDataNode,
} from '../../../../../../../src/verticals/crm/adapters/carerix/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

function makeRaw(overrides: Partial<RawCarerixNodeType> = {}): RawCarerixNodeType {
  return { id: 1, name: 'Vacancies', ...overrides }
}

function makeStage(overrides: Partial<RawCarerixDataNode> = {}): RawCarerixDataNode {
  return { dataNodeID: 1, name: 'Active', sortOrder: 0, ...overrides }
}

describe('carerix transformPipeline', () => {
  it('maps id to string', () => {
    expect(transformPipeline(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('falls back to nodeTypeKey when id is absent', () => {
    const raw: RawCarerixNodeType = { nodeTypeKey: 'pubStatus', name: 'Publication Status' }
    expect(transformPipeline(raw).id).toBe('pubStatus')
  })

  it('maps name', () => {
    expect(transformPipeline(makeRaw({ name: 'Sales Pipeline' })).name).toBe('Sales Pipeline')
  })

  it('maps stages from nodes array', () => {
    const nodes: RawCarerixDataNode[] = [
      { dataNodeID: 10, name: 'Active', sortOrder: 0 },
      { dataNodeID: 20, name: 'Closed', sortOrder: 1 },
    ]
    const result = transformPipeline(makeRaw({ nodes }))
    expect(result.stages).toHaveLength(2)
    expect(result.stages?.[0].id).toBe('10')
    expect(result.stages?.[0].name).toBe('Active')
    expect(result.stages?.[0].order).toBe(0)
    expect(result.stages?.[1].id).toBe('20')
    expect(result.stages?.[1].name).toBe('Closed')
  })

  it('uses string sortOrder as integer order', () => {
    const nodes: RawCarerixDataNode[] = [makeStage({ sortOrder: '3' })]
    const result = transformPipeline(makeRaw({ nodes }))
    expect(result.stages?.[0].order).toBe(3)
  })

  it('returns empty stages array when nodes is absent', () => {
    const result = transformPipeline(makeRaw({ nodes: undefined }))
    expect(result.stages).toEqual([])
  })

  it('maps dateCreated/dateModified to created_at/updated_at', () => {
    const result = transformPipeline(
      makeRaw({
        dateCreated: '2026-01-01T00:00:00.000Z',
        dateModified: '2026-02-01T00:00:00.000Z',
      }),
    )
    expect(result.created_at).toBe('2026-01-01T00:00:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T00:00:00.000Z')
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformPipeline(makeRaw())).not.toThrow()
  })

  it('produces output that passes PipelineSchema.parse', () => {
    const raw = makeRaw({
      nodes: [
        { dataNodeID: 1, name: 'Applied', sortOrder: 0 },
        { dataNodeID: 2, name: 'Interview', sortOrder: 1 },
      ],
      dateCreated: '2026-01-01T00:00:00.000Z',
      dateModified: '2026-02-01T00:00:00.000Z',
    })
    expect(() => PipelineSchema.parse(transformPipeline(raw))).not.toThrow()
  })
})
