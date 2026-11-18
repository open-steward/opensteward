/**
 * The `ssalesprocesses_status` Field_Info from GET SSalesProcesses/Fields
 * (BaseModule_Get_Fields_Response, WebservicePremium.json).
 */
import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline } from '../../../../../../../src/verticals/crm/adapters/yetiforce/transform/pipeline'
import fields from '../fixtures/ssalesprocesses-fields.json'

const status = fields.result.fields.ssalesprocesses_status as Record<string, unknown>

describe('yetiforce transformPipeline', () => {
  it('is the status field: id is the field name, name its label, stages its picklist in order', () => {
    const p = PipelineSchema.parse(transformPipeline(status))
    expect(p.id).toBe('ssalesprocesses_status')
    expect(p.name).toBe('Status')
    expect(p.stages).toEqual([
      { id: 'PLL_DRAFT', name: 'Draft', order: 0 },
      { id: 'PLL_FOR_REALIZATION', name: 'For realization', order: 1 },
      { id: 'PLL_NEGOTIATIONS', name: 'Negotiations', order: 2 },
      { id: 'PLL_SALE_COMPLETED', name: 'Sale completed', order: 3 },
      { id: 'PLL_SALE_FAILED', name: 'Sale failed', order: 4 },
    ])
  })

  it('throws instead of inventing a name when the label is missing', () => {
    expect(() => transformPipeline({ ...status, label: undefined })).toThrow(/label/)
  })

  it('preserves raw metadata by reference', () => {
    expect(transformPipeline(status).metadata).toBe(status)
  })
})
