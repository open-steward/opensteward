import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
} from '../../../../../../../src/verticals/crm/adapters/ragic/transform/activity'
import type { RagicRecord } from '../../../../../../../src/verticals/crm/adapters/ragic/client'

function makeRaw(overrides: Partial<RagicRecord> = {}): RagicRecord {
  return { _ragic_id: 1, ...overrides }
}

describe('ragic transformActivity', () => {
  it('maps _ragic_id to id string', () => {
    expect(transformActivity(makeRaw({ _ragic_id: 3 })).id).toBe('3')
  })

  it('maps Subject field', () => {
    expect(transformActivity(makeRaw({ 'Subject': 'Follow up' })).subject).toBe('Follow up')
  })

  it('maps Done field (Yes -> true)', () => {
    expect(transformActivity(makeRaw({ 'Done': 'Yes' })).done).toBe(true)
    expect(transformActivity(makeRaw({ 'Done': 'No' })).done).toBe(false)
  })

  it('maps Done field (1 -> true)', () => {
    expect(transformActivity(makeRaw({ 'Done': '1' })).done).toBe(true)
  })

  it('handles empty record gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw({ _ragic_id: 3 }))
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('ragic untransformActivity', () => {
  it('maps done (true) to "Yes"', () => {
    const result = untransformActivity({ done: true })
    expect(result['Done']).toBe('Yes')
  })

  it('maps done (false) to "No"', () => {
    const result = untransformActivity({ done: false })
    expect(result['Done']).toBe('No')
  })
})
