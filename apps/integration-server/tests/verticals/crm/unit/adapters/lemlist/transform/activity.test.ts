import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  type RawLemlistActivity,
} from '../../../../../../../src/verticals/crm/adapters/lemlist/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawLemlistActivity> = {}): RawLemlistActivity {
  return { _id: 'act_1', ...overrides }
}

describe('lemlist transformActivity', () => {
  it('maps _id to string id', () => {
    expect(transformActivity(makeRaw({ _id: 'act_42' })).id).toBe('act_42')
  })

  it('maps type', () => {
    expect(transformActivity(makeRaw({ type: 'emailSent' })).type).toBe('emailSent')
  })

  it('uses type as subject', () => {
    expect(transformActivity(makeRaw({ type: 'emailSent' })).subject).toBe('emailSent')
  })

  it('maps leadId to contact_id', () => {
    expect(transformActivity(makeRaw({ leadId: 'lead_10' })).contact_id).toBe('lead_10')
  })

  it('maps sendUserId to owner_id', () => {
    expect(transformActivity(makeRaw({ sendUserId: 'user_5' })).owner_id).toBe('user_5')
  })

  it('maps createdAt to created_at', () => {
    expect(transformActivity(makeRaw({ createdAt: '2026-01-01T00:00:00.000Z' })).created_at).toBe(
      '2026-01-01T00:00:00.000Z',
    )
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces an ActivitySchema-valid result', () => {
    const raw = makeRaw({
      _id: 'act_1',
      type: 'emailSent',
      leadId: 'lead_10',
      sendUserId: 'user_5',
      campaignId: 'camp_3',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    expect(() => ActivitySchema.parse(transformActivity(raw))).not.toThrow()
  })
})
