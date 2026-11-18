import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline } from '../../../../../../../src/verticals/crm/adapters/maximizer/transform/pipeline'
import { documentedSalesProcess, documentedSalesStage } from '../fixtures/documented'

describe('maximizer transformPipeline (SalesProcessSetup + SalesStageSetup)', () => {
  it('maps a sales process and its stages and parses as a Pipeline', () => {
    const out = PipelineSchema.parse(
      transformPipeline(documentedSalesProcess(), [documentedSalesStage()]),
    )
    expect(out).toMatchObject({
      id: 'U2FsZXNQcm9jZXNzCTI1MDEwMTAwMDAwMDA3NDI1OTI2MTBHCTA=',
      name: 'Sales process for opportunities',
      stages: [
        {
          id: 'U2FsZXNQcm9jZXNzU3RhZ2VTZXR1cAkyNTAxMDIwMDAwMDAwOTE0MTI1NDYwRwkw',
          name: 'First contact',
          win_probability: 10,
        },
      ],
    })
    expect(out.stages?.[0]?.order).toBeUndefined()
  })

  it('keeps only the stages whose SalesProcessSetupKey is this process', () => {
    const other = { ...documentedSalesStage(), Key: 'b3RoZXI=', SalesProcessSetupKey: 'eHl6' }
    const out = transformPipeline(documentedSalesProcess(), [documentedSalesStage(), other])
    expect(out.stages?.map((s) => s.id)).toEqual([documentedSalesStage().Key])
  })

  it('leaves win_probability out when ProbabilityClose is outside 0..100', () => {
    const stage = { ...documentedSalesStage(), ProbabilityClose: 150 }
    const out = transformPipeline(documentedSalesProcess(), [stage])
    expect(out.stages?.[0]?.win_probability).toBeUndefined()
  })

  it('throws when a stage has no Description', () => {
    const stage = { ...documentedSalesStage(), Description: '' }
    expect(() => transformPipeline(documentedSalesProcess(), [stage])).toThrow(
      /sales stage .* has no Description/,
    )
  })

  it('throws when the mandatory Description is missing', () => {
    expect(() => transformPipeline({ Key: 'k' }, [])).toThrow(/Description/)
  })

  it('keeps the raw row as metadata', () => {
    const raw = documentedSalesProcess()
    expect(transformPipeline(raw, []).metadata).toBe(raw)
  })
})
