import { describe, it, expect } from 'vitest'
import {
  transformPipelineFromProgress,
  type RawSimplicateSalesProgress,
} from '../../../../../../../src/verticals/crm/adapters/simplicate/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

describe('simplicate transformPipelineFromProgress', () => {
  it('synthesises a single pipeline with id "default"', () => {
    expect(transformPipelineFromProgress([]).id).toBe('default')
  })

  it('sets name to "Sales Pipeline"', () => {
    expect(transformPipelineFromProgress([]).name).toBe('Sales Pipeline')
  })

  it('sets is_active to true', () => {
    expect(transformPipelineFromProgress([]).is_active).toBe(true)
  })

  it('maps id and label from each progress record to stage id/name', () => {
    const progresses: RawSimplicateSalesProgress[] = [
      { id: 'salesprogress:p1', label: 'Prospect', position: 0 },
    ]
    const pipeline = transformPipelineFromProgress(progresses)
    expect(pipeline.stages?.[0].id).toBe('salesprogress:p1')
    expect(pipeline.stages?.[0].name).toBe('Prospect')
  })

  it('sorts stages by position ascending', () => {
    const progresses: RawSimplicateSalesProgress[] = [
      { id: 'salesprogress:p3', label: 'Won', position: 3 },
      { id: 'salesprogress:p1', label: 'Prospect', position: 0 },
      { id: 'salesprogress:p2', label: 'Proposal', position: 2 },
    ]
    const pipeline = transformPipelineFromProgress(progresses)
    expect(pipeline.stages?.map((s) => s.id)).toEqual([
      'salesprogress:p1',
      'salesprogress:p2',
      'salesprogress:p3',
    ])
  })

  it('maps chance_to_score rounded to win_probability', () => {
    const progresses: RawSimplicateSalesProgress[] = [
      { id: 'salesprogress:p1', label: 'Prospect', position: 0, chance_to_score: 33.7 },
    ]
    expect(transformPipelineFromProgress(progresses).stages?.[0].win_probability).toBe(34)
  })

  it('maps position to stage order', () => {
    const progresses: RawSimplicateSalesProgress[] = [
      { id: 'salesprogress:p1', label: 'First', position: 5 },
    ]
    expect(transformPipelineFromProgress(progresses).stages?.[0].order).toBe(5)
  })

  it('uses empty label string when label absent', () => {
    const progresses: RawSimplicateSalesProgress[] = [{ id: 'salesprogress:p1' }]
    expect(transformPipelineFromProgress(progresses).stages?.[0].name).toBe('')
  })

  it('does not mutate the input array order', () => {
    const progresses: RawSimplicateSalesProgress[] = [
      { id: 'salesprogress:p2', label: 'B', position: 2 },
      { id: 'salesprogress:p1', label: 'A', position: 1 },
    ]
    const originalOrder = progresses.map((p) => p.id)
    transformPipelineFromProgress(progresses)
    expect(progresses.map((p) => p.id)).toEqual(originalOrder)
  })

  it('produces schema-valid output', () => {
    const progresses: RawSimplicateSalesProgress[] = [
      { id: 'salesprogress:p1', label: 'Prospect', position: 0, chance_to_score: 10 },
      { id: 'salesprogress:p2', label: 'Proposal', position: 1, chance_to_score: 50 },
      { id: 'salesprogress:p3', label: 'Negotiation', position: 2, chance_to_score: 80 },
    ]
    expect(() => PipelineSchema.parse(transformPipelineFromProgress(progresses))).not.toThrow()
  })
})
