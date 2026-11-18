import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawMixmaxSequenceRecipient,
} from '../../../../../../../src/verticals/crm/adapters/mixmax/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawMixmaxSequenceRecipient> = {}): RawMixmaxSequenceRecipient {
  return {
    _id: 'rec_abc',
    email: 'jane@example.com',
    sequenceId: 'seq_1',
    status: 'active',
    createdAt: '2026-01-15T09:30:00.000Z',
    updatedAt: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('mixmax transformActivity', () => {
  it('maps _id to string id', () => {
    expect(transformActivity(makeRaw()).id).toBe('rec_abc')
  })

  it('falls back to id field when _id is absent', () => {
    expect(transformActivity(makeRaw({ _id: undefined, id: 'fallback_id' })).id).toBe('fallback_id')
  })

  it('always sets type to "sequence"', () => {
    expect(transformActivity(makeRaw()).type).toBe('sequence')
  })

  it('builds subject from status', () => {
    expect(transformActivity(makeRaw({ status: 'active' })).subject).toBe('Sequence: active')
  })

  it('uses default subject when status is absent', () => {
    expect(transformActivity(makeRaw({ status: undefined })).subject).toBe('Sequence enrollment')
  })

  it('maps email to contact_id', () => {
    expect(transformActivity(makeRaw()).contact_id).toBe('jane@example.com')
  })

  it('converts ISO string timestamps via toIsoDatetime', () => {
    const result = transformActivity(makeRaw())
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('converts numeric epoch createdAt (seconds)', () => {
    // epoch 1_700_000_000 seconds → a valid ISO string
    const result = transformActivity(makeRaw({ createdAt: 1_700_000_000 }))
    expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('passes ActivitySchema validation', () => {
    expect(() => ActivitySchema.parse(transformActivity(makeRaw()))).not.toThrow()
  })

  it('untransformActivity maps contact_id back to email', () => {
    expect(untransformActivity({ contact_id: 'bob@example.com' }).email).toBe('bob@example.com')
  })
})
