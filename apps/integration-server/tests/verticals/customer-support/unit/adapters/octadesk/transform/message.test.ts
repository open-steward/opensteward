import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  type RawOctadeskInteraction,
} from '../../../../../../../src/verticals/customer-support/adapters/octadesk/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'

describe('octadesk transformMessage', () => {
  const raw: RawOctadeskInteraction = {
    id: 'interaction-uuid-1',
    type: 'PUBLIC',
    author: { id: 'agent-uuid-5', name: 'Carlos Support', email: 'carlos@co.example' },
    text: 'Thank you for contacting us. We are looking into your issue.',
    attachments: [],
    createdAt: '2024-07-15T14:30:00.000Z',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformMessage(raw, 'ticket-456')
    expect(result.id).toBe('interaction-uuid-1')
    expect(result.externalId).toBe('interaction-uuid-1')
  })

  it('sets ticketId from second argument', () => {
    const result = transformMessage(raw, 'ticket-456')
    expect(result.ticketId).toBe('ticket-456')
  })

  it('maps text to body', () => {
    const result = transformMessage(raw, 'ticket-456')
    expect(result.body).toBe('Thank you for contacting us. We are looking into your issue.')
  })

  it('maps PUBLIC type to public', () => {
    const result = transformMessage(raw, 'ticket-456')
    expect(result.type).toBe('public')
  })

  it('maps PRIVATE type to internal', () => {
    const internal: RawOctadeskInteraction = { ...raw, type: 'PRIVATE' }
    const result = transformMessage(internal, 'ticket-456')
    expect(result.type).toBe('internal')
  })

  it('maps NOTE type to internal', () => {
    const note: RawOctadeskInteraction = { ...raw, type: 'NOTE' }
    const result = transformMessage(note, 'ticket-456')
    expect(result.type).toBe('internal')
  })

  it('maps author.id to authorId', () => {
    const result = transformMessage(raw, 'ticket-456')
    expect(result.authorId).toBe('agent-uuid-5')
  })

  it('authorType defaults to user', () => {
    const result = transformMessage(raw, 'ticket-456')
    expect(result.authorType).toBe('user')
  })

  it('maps createdAt to ISO string', () => {
    const result = transformMessage(raw, 'ticket-456')
    expect(result.createdAt).toBe('2024-07-15T14:30:00.000Z')
  })

  it('counts attachments (zero here)', () => {
    const result = transformMessage(raw, 'ticket-456')
    expect(result.attachmentCount).toBe(0)
  })

  it('sets platform to octadesk', () => {
    const result = transformMessage(raw, 'ticket-456')
    expect(result.platform).toBe('octadesk')
  })

  it('produces a MessageSchema-valid result', () => {
    const result = transformMessage(raw, 'ticket-456')
    expect(() => MessageSchema.parse(result)).not.toThrow()
  })

  it('falls back to content when text is absent', () => {
    const htmlOnly: RawOctadeskInteraction = {
      ...raw,
      text: undefined,
      content: '<p>HTML body</p>',
    }
    const result = transformMessage(htmlOnly, 'ticket-456')
    expect(result.body).toBe('<p>HTML body</p>')
    expect(() => MessageSchema.parse(result)).not.toThrow()
  })
})
