import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawRespondIoNote,
} from '../../../../../../../src/verticals/crm/adapters/respond-io/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

describe('respond-io transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote({ id: 11 }).id).toBe('11')
  })

  it('maps content, falling back to empty string', () => {
    expect(transformNote({ id: '1', content: 'Hello' }).content).toBe('Hello')
    expect(transformNote({ id: '1' }).content).toBe('')
  })

  it('maps contactId to contact_id string', () => {
    expect(transformNote({ id: '1', contactId: 5 }).contact_id).toBe('5')
  })

  it('leaves contact_id undefined when contactId absent', () => {
    expect(transformNote({ id: '1' }).contact_id).toBeUndefined()
  })

  it('preserves raw metadata', () => {
    const raw: RawRespondIoNote = { id: '3', content: 'note' }
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    const raw: RawRespondIoNote = { id: '20', content: 'A great note', contactId: '7' }
    expect(() => NoteSchema.parse(transformNote(raw))).not.toThrow()
  })
})

describe('respond-io untransformNote', () => {
  it('maps content', () => {
    expect(untransformNote({ content: 'My note' })).toMatchObject({ content: 'My note' })
  })

  it('omits unset fields', () => {
    expect(untransformNote({})).not.toHaveProperty('content')
  })
})
