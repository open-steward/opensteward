import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline } from '../../../../../../../src/verticals/crm/adapters/membrain/transform/pipeline'
import { DOC_SALES_PROCESS } from '../fixtures/docs'

describe('membrain transformPipeline', () => {
  it('maps the documented GET /salesProcesses/ example', () => {
    const out = PipelineSchema.parse(transformPipeline(DOC_SALES_PROCESS))
    expect(out.id).toBe('6ab83f5c-8e49-4182-b273-c97433525c45')
    expect(out.name).toBe('Sales Process')
    expect(out.stages).toEqual([
      { id: '481eaa00-dae4-4d57-afc8-52d024512786', name: 'Engage' },
      { id: '5e2a0e33-e94f-4da2-911f-b59a900ac16d', name: 'Close' },
    ])
    expect(out.metadata).toEqual(DOC_SALES_PROCESS)
  })

  it('leaves stages absent when the process has none', () => {
    const { Stages: _s, ...raw } = DOC_SALES_PROCESS
    expect(PipelineSchema.parse(transformPipeline(raw)).stages).toBeUndefined()
  })
})
