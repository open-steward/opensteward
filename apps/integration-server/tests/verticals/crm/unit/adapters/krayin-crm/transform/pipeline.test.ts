/**
 * Fixture: one PipelineResource as krayin/rest-api emits it
 * (src/Http/Resources/V1/Setting/PipelineResource.php + StageResource.php).
 * Pipeline scalars are the documented examples of
 * src/Docs/Models/Settings/Pipeline.php (id 1, name "Lost", rotten_days "30",
 * is_default "30", created_at/updated_at "2020-01-27 17:50:45"). No Stage
 * model is documented, so stage code/name are the examples of the pipeline
 * store body in src/Docs/Controllers/Settings/PipelineController.php
 * ("new"/"New", "won"/"Won", "lost"/"Lost"); stage ids and the remaining
 * StageResource fields are placeholders, not documented values.
 */
import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawKrayinPipeline,
} from '../../../../../../../src/verticals/crm/adapters/krayin-crm/transform/pipeline'

function stage(id: number, code: string, name: string) {
  return { id, code, name, is_user_defined: 0, created_at: null, updated_at: null }
}

function doc(): RawKrayinPipeline {
  return {
    id: 1,
    name: 'Lost',
    is_default: '30',
    rotten_days: '30',
    stages: [stage(1, 'new', 'New'), stage(2, 'won', 'Won'), stage(3, 'lost', 'Lost')],
    created_at: '2020-01-27 17:50:45',
    updated_at: '2020-01-27 17:50:45',
  }
}

describe('krayin-crm transformPipeline', () => {
  it('maps the documented resource and satisfies the canonical schema', () => {
    const out = PipelineSchema.parse(transformPipeline(doc()))
    expect(out.id).toBe('1')
    expect(out.name).toBe('Lost')
    expect(out.created_at).toBe('2020-01-27T17:50:45.000Z')
    expect(out.updated_at).toBe('2020-01-27T17:50:45.000Z')
  })

  it('orders stages by their position (Krayin sorts stages by sort_order)', () => {
    const out = PipelineSchema.parse(transformPipeline(doc()))
    expect(out.stages).toEqual([
      { id: '1', name: 'New', order: 0 },
      { id: '2', name: 'Won', order: 1 },
      { id: '3', name: 'Lost', order: 2 },
    ])
  })

  it('does not treat is_default as is_active', () => {
    expect(transformPipeline(doc()).is_active).toBeUndefined()
  })

  it('throws instead of inventing a missing id or name', () => {
    expect(() => transformPipeline({ ...doc(), id: undefined })).toThrow(/no id/)
    expect(() => transformPipeline({ ...doc(), name: undefined })).toThrow(/name/)
    expect(() => transformPipeline({ ...doc(), stages: [{ name: 'x' }] })).toThrow(
      /stage has no id/,
    )
    expect(() => transformPipeline({ ...doc(), stages: [{ id: 1 }] })).toThrow(/stage name/)
  })

  it('keeps the raw payload as metadata', () => {
    const raw = doc()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })
})
