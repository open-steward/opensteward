/**
 * Bigin Team Pipelines are the layouts of the Pipelines module
 * (GET /bigin/v2/settings/layouts?module=Pipelines,
 * https://www.bigin.com/developer/docs/apis/v2/layouts-meta-data.html).
 *
 * The fixture is that page's documented sample response, trimmed to each
 * layout's top-level fields and its Stage and Sub_Pipeline picklist fields.
 */
import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawBiginLayout,
} from '../../../../../../../src/verticals/crm/adapters/zoho-bigin/transform/pipeline'
import sample from '../fixtures/layouts-pipelines.json'

const layouts = (sample as { layouts: RawBiginLayout[] }).layouts
const salesMarketing = layouts[0]!
const operations = layouts[1]!

describe('zoho-bigin transformPipeline (layout of the Pipelines module)', () => {
  it('parses every documented sample layout with the canonical schema', () => {
    for (const raw of layouts) {
      expect(() => PipelineSchema.parse(transformPipeline(raw))).not.toThrow()
    }
  })

  it('takes the id from the layout id, the id deals carry in Pipeline.id', () => {
    expect(PipelineSchema.parse(transformPipeline(salesMarketing)).id).toBe('2034020000000095023')
  })

  it('takes the name from display_label', () => {
    expect(PipelineSchema.parse(transformPipeline(operations)).name).toBe('Operations')
  })

  it('takes the name from display_label, not the layout name, when they differ', () => {
    // layouts-meta-data.html: display_label is "The display label or name
    // assigned to the layout."; name is "The name or identifier of the layout."
    // They are equal in every documented sample layout, so this test makes them differ.
    const renamed = { ...operations, display_label: 'Ops (renamed)' }
    expect(PipelineSchema.parse(transformPipeline(renamed)).name).toBe('Ops (renamed)')
  })

  it('sorts stages without a sequence_number after the numbered ones, in a total order', () => {
    const stageField = {
      api_name: 'Stage',
      pick_list_values: [
        { id: 'x', display_value: 'Unnumbered' },
        { id: 'c', display_value: 'Third', sequence_number: 30 },
        { id: 'a', display_value: 'First', sequence_number: 10 },
        { id: 'b', display_value: 'Second', sequence_number: 20 },
      ],
    }
    const p = transformPipeline({ ...operations, sections: [{ fields: [stageField] }] })
    expect(p.stages?.map((s) => s.id)).toEqual(['a', 'b', 'c', 'x'])
  })

  it('takes the stages from the Stage picklist, not the Sub_Pipeline picklist', () => {
    const p = PipelineSchema.parse(transformPipeline(salesMarketing))
    expect(p.stages?.map((s) => s.id)).toEqual([
      '2034020000000007104',
      '2034020000000007106',
      '2034020000000007112',
      '2034020000000007114',
      '2034020000000464292',
      '2034020000000464293',
      '2034020000000464294',
      '2034020000000007116',
      '2034020000000007118',
    ])
    expect(p.stages?.[0]).toEqual({
      id: '2034020000000007104',
      name: 'Qualification',
      order: 0,
      win_probability: 66,
    })
    expect(p.stages?.[8]).toEqual({
      id: '2034020000000007118',
      name: 'Closed Lost',
      order: 8,
      win_probability: 0,
    })
  })

  it('orders stages by sequence_number, 0-indexed, whatever the array order', () => {
    const stageField = {
      api_name: 'Stage',
      pick_list_values: [
        { id: 'b', display_value: 'Second', sequence_number: 1000 },
        { id: 'a', display_value: 'First', sequence_number: 2 },
      ],
    }
    const p = transformPipeline({ ...operations, sections: [{ fields: [stageField] }] })
    expect(p.stages).toEqual([
      { id: 'a', name: 'First', order: 0 },
      { id: 'b', name: 'Second', order: 1 },
    ])
  })

  it('maps created_time and modified_time, and omits a null created_time', () => {
    const sm = PipelineSchema.parse(transformPipeline(salesMarketing))
    expect(sm.created_at).toBeUndefined()
    expect(sm.updated_at).toBe('2023-05-10T19:28:46+05:30')
    const op = PipelineSchema.parse(transformPipeline(operations))
    expect(op.created_at).toBe('2023-04-12T12:05:17+05:30')
    expect(op.updated_at).toBe('2023-04-12T12:05:19+05:30')
  })

  it('has no stages when the layout carries no Stage field', () => {
    const p = PipelineSchema.parse(transformPipeline({ ...operations, sections: [] }))
    expect(p.stages).toBeUndefined()
  })

  it('preserves the raw layout as metadata', () => {
    expect(transformPipeline(operations).metadata).toBe(operations)
  })
})
