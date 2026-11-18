import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  type RawWatiActivity,
} from '../../../../../../../src/verticals/crm/adapters/wati/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

describe('wati transformActivity (stub)', () => {
  it('maps id to string', () => {
    const raw: RawWatiActivity = { id: 'act_001' }
    expect(transformActivity(raw).id).toBe('act_001')
  })

  it('converts numeric id to string', () => {
    const raw: RawWatiActivity = { id: 42 }
    expect(transformActivity(raw).id).toBe('42')
  })

  it('preserves raw as metadata by reference', () => {
    const raw: RawWatiActivity = { id: 'act_001' }
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output (stub emits only id + metadata)', () => {
    // Stub does not set required Activity fields beyond id; schema allows missing optional fields.
    const raw: RawWatiActivity = { id: 'act_001' }
    expect(() => ActivitySchema.parse(transformActivity(raw))).not.toThrow()
  })
})
