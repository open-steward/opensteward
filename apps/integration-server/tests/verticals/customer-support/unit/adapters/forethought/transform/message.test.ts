import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  type RawForethoughtTurn,
} from '../../../../../../../src/verticals/customer-support/adapters/forethought/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'

describe('forethought transformMessage', () => {
  const CONV_ID = 'conv-abc-123'

  const raw: RawForethoughtTurn = {
    turn_id: 'turn-1',
    role: 'user',
    widget_components: [
      { type: 'text', format: 'plain', message: 'Hello, I need help with my order.' },
    ],
    created_at: '2024-04-10T14:00:00.000Z',
  }

  it('maps turn_id to id and externalId', () => {
    const result = transformMessage(raw, CONV_ID)
    expect(result.id).toBe('turn-1')
    expect(result.externalId).toBe('turn-1')
  })

  it('sets ticketId from conversationId parameter', () => {
    const result = transformMessage(raw, CONV_ID)
    expect(result.ticketId).toBe(CONV_ID)
  })

  it('maps role=user to authorType=contact', () => {
    const result = transformMessage(raw, CONV_ID)
    expect(result.authorType).toBe('contact')
  })

  it('maps role=bot to authorType=system', () => {
    const botTurn: RawForethoughtTurn = { ...raw, role: 'bot' }
    const result = transformMessage(botTurn, CONV_ID)
    expect(result.authorType).toBe('system')
    expect(() => MessageSchema.parse(result)).not.toThrow()
  })

  it('extracts body from widget_components messages', () => {
    const result = transformMessage(raw, CONV_ID)
    expect(result.body).toBe('Hello, I need help with my order.')
  })

  it('prefers flat text field over widget_components', () => {
    const withFlat: RawForethoughtTurn = { ...raw, text: 'Flat text wins' }
    const result = transformMessage(withFlat, CONV_ID)
    expect(result.body).toBe('Flat text wins')
  })

  it('concatenates multiple widget_component messages with newline', () => {
    const multiComp: RawForethoughtTurn = {
      ...raw,
      widget_components: [
        { type: 'text', message: 'First line.' },
        { type: 'text', message: 'Second line.' },
      ],
    }
    const result = transformMessage(multiComp, CONV_ID)
    expect(result.body).toBe('First line.\nSecond line.')
  })

  it('uses role as authorId (no user ID in payload)', () => {
    const result = transformMessage(raw, CONV_ID)
    expect(result.authorId).toBe('user')
  })

  it('always sets type to public', () => {
    const result = transformMessage(raw, CONV_ID)
    expect(result.type).toBe('public')
  })

  it('sets platform to forethought', () => {
    const result = transformMessage(raw, CONV_ID)
    expect(result.platform).toBe('forethought')
  })

  it('produces a MessageSchema-valid result', () => {
    const result = transformMessage(raw, CONV_ID)
    expect(() => MessageSchema.parse(result)).not.toThrow()
  })

  it('handles missing turn_id — generates fallback id', () => {
    const noId: RawForethoughtTurn = { role: 'bot', widget_components: [] }
    const result = transformMessage(noId, CONV_ID)
    expect(result.id).toBe(`${CONV_ID}:unknown`)
    expect(result.authorType).toBe('system')
    expect(() => MessageSchema.parse(result)).not.toThrow()
  })

  it('handles missing created_at — falls back to epoch', () => {
    const noDate: RawForethoughtTurn = { ...raw, created_at: undefined }
    const result = transformMessage(noDate, CONV_ID)
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })
})
