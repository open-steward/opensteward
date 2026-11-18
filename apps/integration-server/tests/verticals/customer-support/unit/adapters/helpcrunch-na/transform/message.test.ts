import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  type RawInvGateComment,
} from '../../../../../../../src/verticals/customer-support/adapters/helpcrunch-na/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'

describe('helpcrunch-na transformMessage', () => {
  const TICKET_ID = 'incident-500'

  const raw: RawInvGateComment = {
    id: 301,
    incident_id: 500,
    author_id: 42,
    message: 'Thanks for reaching out, we are looking into this.',
    created_at: '2024-06-10T09:30:00.000Z',
    customer_visible: 1,
    is_solution: 0,
    attachments: [{ name: 'screenshot.png' }],
    reference: null,
    msg_num: 1,
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformMessage(raw, TICKET_ID)
    expect(result.id).toBe('301')
    expect(result.externalId).toBe('301')
  })

  it('sets ticketId from parameter', () => {
    const result = transformMessage(raw, TICKET_ID)
    expect(result.ticketId).toBe(TICKET_ID)
  })

  it('maps message to body', () => {
    const result = transformMessage(raw, TICKET_ID)
    expect(result.body).toBe('Thanks for reaching out, we are looking into this.')
  })

  it('maps customer_visible=1 to type=public', () => {
    const result = transformMessage(raw, TICKET_ID)
    expect(result.type).toBe('public')
  })

  it('maps customer_visible=0 to type=internal', () => {
    const internal: RawInvGateComment = { ...raw, customer_visible: 0 }
    const result = transformMessage(internal, TICKET_ID)
    expect(result.type).toBe('internal')
  })

  it('maps author_id to authorId', () => {
    const result = transformMessage(raw, TICKET_ID)
    expect(result.authorId).toBe('42')
  })

  it('sets authorType to user', () => {
    // InvGate/helpcrunch-na always uses 'user' for authorType
    const result = transformMessage(raw, TICKET_ID)
    expect(result.authorType).toBe('user')
  })

  it('counts attachments', () => {
    const result = transformMessage(raw, TICKET_ID)
    expect(result.attachmentCount).toBe(1)
  })

  it('sets platform to helpcrunch-na', () => {
    const result = transformMessage(raw, TICKET_ID)
    expect(result.platform).toBe('helpcrunch-na')
  })

  it('stores isSolution in metadata', () => {
    const result = transformMessage(raw, TICKET_ID)
    expect(result.metadata['isSolution']).toBe('0')
  })

  it('produces a MessageSchema-valid result', () => {
    const result = transformMessage(raw, TICKET_ID)
    expect(() => MessageSchema.parse(result)).not.toThrow()
  })

  it('handles missing author_id — authorId is empty string', () => {
    const noAuthor: RawInvGateComment = { ...raw, author_id: null }
    const result = transformMessage(noAuthor, TICKET_ID)
    expect(result.authorId).toBe('')
    expect(() => MessageSchema.parse(result)).not.toThrow()
  })

  it('handles missing created_at — falls back to epoch', () => {
    const noDate: RawInvGateComment = { ...raw, created_at: null }
    const result = transformMessage(noDate, TICKET_ID)
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })
})
