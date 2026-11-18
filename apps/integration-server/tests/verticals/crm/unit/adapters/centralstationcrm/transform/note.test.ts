import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawCentralStationProtocol,
} from '../../../../../../../src/verticals/crm/adapters/centralstationcrm/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawCentralStationProtocol> = {}): RawCentralStationProtocol {
  return { id: 1, content: 'Meeting recap', ...overrides }
}

describe('centralstationcrm transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps content field to content', () => {
    expect(transformNote(makeRaw({ content: 'Call notes' })).content).toBe('Call notes')
  })

  it('falls back to name when content is absent', () => {
    const result = transformNote({ id: 1, name: 'Fallback title' })
    expect(result.content).toBe('Fallback title')
  })

  it('defaults content to empty string when both absent', () => {
    const result = transformNote({ id: 1 })
    expect(result.content).toBe('')
  })

  it('maps user_id to owner_id as string', () => {
    expect(transformNote(makeRaw({ user_id: 5 })).owner_id).toBe('5')
  })

  it('routes person attachable_type to contact_id', () => {
    const result = transformNote(makeRaw({ attachable_type: 'Person', attachable_id: 10 }))
    expect(result.contact_id).toBe('10')
    expect(result.company_id).toBeUndefined()
    expect(result.deal_id).toBeUndefined()
  })

  it('routes Company attachable_type to company_id', () => {
    const result = transformNote(makeRaw({ attachable_type: 'Company', attachable_id: 20 }))
    expect(result.company_id).toBe('20')
    expect(result.contact_id).toBeUndefined()
  })

  it('routes Deal attachable_type to deal_id', () => {
    const result = transformNote(makeRaw({ attachable_type: 'Deal', attachable_id: 3 }))
    expect(result.deal_id).toBe('3')
  })

  it('routes project attachable_type to deal_id (case-insensitive)', () => {
    const result = transformNote(makeRaw({ attachable_type: 'project', attachable_id: 7 }))
    expect(result.deal_id).toBe('7')
  })

  it('maps created_at and updated_at', () => {
    const result = transformNote(
      makeRaw({
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-02-01T00:00:00.000Z',
      }),
    )
    expect(result.created_at).toBe('2026-01-01T00:00:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T00:00:00.000Z')
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('produces output that passes NoteSchema.parse', () => {
    const raw = makeRaw({
      content: 'Discovery call notes',
      user_id: 3,
      attachable_type: 'Person',
      attachable_id: 15,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-02-01T00:00:00.000Z',
    })
    expect(() => NoteSchema.parse(transformNote(raw))).not.toThrow()
  })
})

describe('centralstationcrm untransformNote', () => {
  it('wraps output in protocol key', () => {
    const result = untransformNote({})
    expect(result).toHaveProperty('protocol')
  })

  it('maps content to protocol.content', () => {
    const result = untransformNote({ content: 'My note' })
    expect((result.protocol as Record<string, unknown>).content).toBe('My note')
  })

  it('maps owner_id to protocol.user_id', () => {
    const result = untransformNote({ owner_id: 'usr_4' })
    expect((result.protocol as Record<string, unknown>).user_id).toBe('usr_4')
  })

  it('maps contact_id to protocol.attachable with Person type', () => {
    const result = untransformNote({ contact_id: 'con_1' })
    const protocol = result.protocol as Record<string, unknown>
    expect(protocol.attachable_id).toBe('con_1')
    expect(protocol.attachable_type).toBe('Person')
  })

  it('maps company_id to protocol.attachable with Company type when contact_id absent', () => {
    const result = untransformNote({ company_id: 'co_2' })
    const protocol = result.protocol as Record<string, unknown>
    expect(protocol.attachable_id).toBe('co_2')
    expect(protocol.attachable_type).toBe('Company')
  })

  it('maps deal_id to protocol.attachable with Deal type when others absent', () => {
    const result = untransformNote({ deal_id: 'deal_5' })
    const protocol = result.protocol as Record<string, unknown>
    expect(protocol.attachable_id).toBe('deal_5')
    expect(protocol.attachable_type).toBe('Deal')
  })
})
