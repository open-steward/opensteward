import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
} from '../../../../../../../src/verticals/crm/adapters/kintone/transform/activity'
import type { KintoneRecord } from '../../../../../../../src/verticals/crm/adapters/kintone/client'

function makeRaw(extra: Record<string, { value: unknown }> = {}): KintoneRecord {
  return {
    $id: { value: '7' },
    $revision: { value: '1' },
    ...extra,
  }
}

describe('kintone transformActivity', () => {
  it('maps $id to id', () => {
    expect(transformActivity(makeRaw()).id).toBe('7')
  })

  it('maps subject field', () => {
    const result = transformActivity(makeRaw({ subject: { value: 'Follow up' } }))
    expect(result.subject).toBe('Follow up')
  })

  it('marks done when done field is "on"', () => {
    expect(transformActivity(makeRaw({ done: { value: 'on' } })).done).toBe(true)
  })

  it('marks done when done field is "true"', () => {
    expect(transformActivity(makeRaw({ done: { value: 'true' } })).done).toBe(true)
  })

  it('marks not done for other values', () => {
    expect(transformActivity(makeRaw({ done: { value: 'false' } })).done).toBe(false)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('kintone untransformActivity', () => {
  it('wraps done as "on" or "off"', () => {
    const on = untransformActivity({ done: true })
    const off = untransformActivity({ done: false })
    expect(on['done']).toEqual({ value: 'on' })
    expect(off['done']).toEqual({ value: 'off' })
  })
})
