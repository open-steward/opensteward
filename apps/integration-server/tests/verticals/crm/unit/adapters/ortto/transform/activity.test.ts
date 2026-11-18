import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawOrttoActivity,
} from '../../../../../../../src/verticals/crm/adapters/ortto/transform/activity'

function makeRaw(overrides: Partial<RawOrttoActivity> = {}): RawOrttoActivity {
  return { id: 'act-1', ...overrides }
}

describe('ortto transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: 'act-9' })).id).toBe('act-9')
  })

  it('maps type and note', () => {
    const result = transformActivity(makeRaw({ type: 'click', description: 'Clicked link' }))
    expect(result.type).toBe('click')
    expect(result.note).toBe('Clicked link')
  })

  it('maps contact_id from person_id', () => {
    const result = transformActivity(makeRaw({ person_id: 'p-5' }))
    expect(result.contact_id).toBe('p-5')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw({ id: 'act-9' }))
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('ortto untransformActivity', () => {
  it('maps note to description', () => {
    const result = untransformActivity({ note: 'desc' })
    expect(result.description).toBe('desc')
  })
})
