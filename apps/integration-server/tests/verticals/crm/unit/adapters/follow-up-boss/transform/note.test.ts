import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawFollowUpBossNote,
} from '../../../../../../../src/verticals/crm/adapters/follow-up-boss/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawFollowUpBossNote> = {}): RawFollowUpBossNote {
  return { id: 1, ...overrides }
}

describe('follow-up-boss transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: 12 })).id).toBe('12')
  })

  it('maps body to content', () => {
    expect(transformNote(makeRaw({ body: 'Great call' })).content).toBe('Great call')
  })

  it('falls back to empty string when body absent', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('maps personId to contact_id string', () => {
    expect(transformNote(makeRaw({ personId: 101 })).contact_id).toBe('101')
  })

  it('maps dealId to deal_id string', () => {
    expect(transformNote(makeRaw({ dealId: 202 })).deal_id).toBe('202')
  })

  it('prefers createdBy over userId for owner_id', () => {
    const result = transformNote(makeRaw({ createdBy: 'author@example.com', userId: 5 }))
    expect(result.owner_id).toBe('author@example.com')
  })

  it('falls back to userId string when createdBy absent', () => {
    expect(transformNote(makeRaw({ userId: 5 })).owner_id).toBe('5')
  })

  it('maps created/updated timestamps directly', () => {
    const result = transformNote(
      makeRaw({ created: '2023-11-01T10:00:00.000Z', updated: '2023-11-14T22:00:00.000Z' }),
    )
    expect(result.created_at).toBe('2023-11-01T10:00:00.000Z')
    expect(result.updated_at).toBe('2023-11-14T22:00:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('passes NoteSchema validation with full input', () => {
    const raw: RawFollowUpBossNote = {
      id: 12,
      personId: 101,
      dealId: 202,
      body: 'Great call with client.',
      createdBy: 'author@example.com',
      created: '2023-11-01T10:00:00.000Z',
      updated: '2023-11-14T22:00:00.000Z',
    }
    const result = transformNote(raw)
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('follow-up-boss untransformNote', () => {
  it('maps content back to body', () => {
    expect(untransformNote({ content: 'Great call' }).body).toBe('Great call')
  })

  it('maps contact_id back to personId', () => {
    expect(untransformNote({ contact_id: '101' }).personId).toBe('101')
  })

  it('maps deal_id back to dealId', () => {
    expect(untransformNote({ deal_id: '202' }).dealId).toBe('202')
  })

  it('maps owner_id back to userId', () => {
    expect(untransformNote({ owner_id: 'author@example.com' }).userId).toBe('author@example.com')
  })

  it('omits unset fields', () => {
    const result = untransformNote({})
    expect(result).not.toHaveProperty('body')
    expect(result).not.toHaveProperty('personId')
  })
})
