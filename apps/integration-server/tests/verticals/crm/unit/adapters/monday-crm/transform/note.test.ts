import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
} from '../../../../../../../src/verticals/crm/adapters/monday-crm/transform/note'
import type { MondayUpdate } from '../../../../../../../src/verticals/crm/adapters/monday-crm/client'

function makeRaw(overrides: Partial<MondayUpdate> = {}): MondayUpdate {
  return { id: 'u-1', body: '', creator_id: '', created_at: '', ...overrides }
}

describe('monday-crm transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw({ id: 'u-1' })).id).toBe('u-1')
  })

  it('maps body to content', () => {
    expect(transformNote(makeRaw({ body: 'Note content' })).content).toBe('Note content')
  })

  it('maps creator_id to owner_id', () => {
    expect(transformNote(makeRaw({ creator_id: 'u-5' })).owner_id).toBe('u-5')
  })

  it('sets owner_id to undefined for empty creator_id', () => {
    expect(transformNote(makeRaw({ creator_id: '' })).owner_id).toBeUndefined()
  })

  it('maps created_at to a strict ISO datetime', () => {
    // monday.com's `created_at` on Updates has been a full ISO 8601 datetime
    // (T separator, Z offset) since the April 2021 date-time API change —
    // https://developer-community.monday.com/product-updates/date-time-api-change-4825
    expect(transformNote(makeRaw({ created_at: '2023-02-21T22:50:57.654Z' })).created_at).toBe(
      '2023-02-21T22:50:57.654Z',
    )
  })

  it('sets created_at to undefined for empty created_at', () => {
    expect(transformNote(makeRaw({ created_at: '' })).created_at).toBeUndefined()
  })

  it('passes contactId', () => {
    expect(transformNote(makeRaw(), 'c-1').contact_id).toBe('c-1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw as unknown as Record<string, unknown>)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ created_at: '2023-02-21T22:50:57.654Z' }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
