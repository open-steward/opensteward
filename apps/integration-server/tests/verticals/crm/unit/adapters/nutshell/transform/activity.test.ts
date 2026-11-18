import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawNutshellActivity,
} from '../../../../../../../src/verticals/crm/adapters/nutshell/transform/activity'

function makeRaw(overrides: Partial<RawNutshellActivity> = {}): RawNutshellActivity {
  return { id: 1, ...overrides }
}

describe('nutshell transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: 10 })).id).toBe('10')
  })

  it('maps subject from name', () => {
    expect(transformActivity(makeRaw({ name: 'Call Client' })).subject).toBe('Call Client')
  })

  it('maps done from isCompleted', () => {
    expect(transformActivity(makeRaw({ isCompleted: true })).done).toBe(true)
    expect(transformActivity(makeRaw({ isCompleted: false })).done).toBe(false)
  })

  it('maps contact_id from first contact', () => {
    const result = transformActivity(makeRaw({ contacts: [{ id: 42 }] }))
    expect(result.contact_id).toBe('42')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw({ id: 10 }))
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('nutshell untransformActivity', () => {
  it('maps subject to name', () => {
    const result = untransformActivity({ subject: 'Follow up', done: true })
    expect(result.name).toBe('Follow up')
    expect(result.isCompleted).toBe(true)
  })
})
