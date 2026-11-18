import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawLacrmPipelineItem,
} from '../../../../../../../src/verticals/crm/adapters/lacrm/transform/deal'

function makeRaw(overrides: Partial<RawLacrmPipelineItem> = {}): RawLacrmPipelineItem {
  return { PipelineItemId: 'pi-1', ...overrides }
}

describe('lacrm transformDeal', () => {
  it('maps PipelineItemId to id', () => {
    expect(transformDeal(makeRaw({ PipelineItemId: 'pi-1' })).id).toBe('pi-1')
  })

  it('maps Name to title', () => {
    expect(transformDeal(makeRaw({ Name: 'Big Deal' })).title).toBe('Big Deal')
  })

  it('defaults title to empty string', () => {
    expect(transformDeal(makeRaw()).title).toBe('')
  })

  it('maps PipelineId and StatusId', () => {
    const result = transformDeal(makeRaw({ PipelineId: 'p-1', StatusId: 's-2' }))
    expect(result.pipeline_id).toBe('p-1')
    expect(result.stage_id).toBe('s-2')
  })

  it('maps ContactId to contact_ids', () => {
    const result = transformDeal(makeRaw({ ContactId: 'c-3' }))
    expect(result.contact_ids).toEqual(['c-3'])
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ PipelineItemId: 'pi-1' }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('lacrm untransformDeal', () => {
  it('maps title to Name', () => {
    const result = untransformDeal({ title: 'New Deal' })
    expect(result.Name).toBe('New Deal')
  })
})
