import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  type RawCognigyMessage,
} from '../../../../../../../src/verticals/customer-support/adapters/cognigy/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'

describe('cognigy transformMessage', () => {
  const raw: RawCognigyMessage = {
    id: 999,
    content: 'My order has not arrived.',
    message_type: 0, // incoming (contact)
    private: false,
    created_at: 1_700_000_000, // Unix epoch seconds
    sender_id: 55,
    sender: { id: 55, type: 'contact' },
    conversation_id: 77,
    attachments: [],
  }

  it('maps id to string', () => {
    const out = transformMessage(raw, 'tkt_77')
    expect(out.id).toBe('999')
  })

  it('maps ticketId from argument', () => {
    const out = transformMessage(raw, 'tkt_77')
    expect(out.ticketId).toBe('tkt_77')
  })

  it('maps body from content', () => {
    const out = transformMessage(raw, 'tkt_77')
    expect(out.body).toBe('My order has not arrived.')
  })

  it('maps incoming message_type 0 → contact authorType', () => {
    const out = transformMessage(raw, 'tkt_77')
    expect(out.authorType).toBe('contact')
  })

  it('maps outgoing message_type 1 → user authorType', () => {
    const agentMsg: RawCognigyMessage = {
      ...raw,
      message_type: 1,
      sender: { id: 10, type: 'user' },
    }
    const out = transformMessage(agentMsg, 'tkt_77')
    expect(out.authorType).toBe('user')
  })

  it('maps activity message_type 2 → system authorType and internal type', () => {
    const activityMsg: RawCognigyMessage = {
      ...raw,
      message_type: 2,
      sender: null,
    }
    const out = transformMessage(activityMsg, 'tkt_77')
    expect(out.authorType).toBe('system')
    expect(out.type).toBe('internal')
  })

  it('maps private=true → internal type', () => {
    const privateMsg: RawCognigyMessage = { ...raw, private: true }
    const out = transformMessage(privateMsg, 'tkt_77')
    expect(out.type).toBe('internal')
  })

  it('maps public message → public type', () => {
    const out = transformMessage(raw, 'tkt_77')
    expect(out.type).toBe('public')
  })

  it('maps authorId from sender.id', () => {
    const out = transformMessage(raw, 'tkt_77')
    expect(out.authorId).toBe('55')
  })

  it('converts Unix epoch seconds to ISO-8601 createdAt', () => {
    const out = transformMessage(raw, 'tkt_77')
    expect(out.createdAt).toBe(new Date(1_700_000_000 * 1000).toISOString())
  })

  it('maps attachmentCount from attachments array length', () => {
    const withAttachments: RawCognigyMessage = {
      ...raw,
      attachments: [{}, {}],
    }
    const out = transformMessage(withAttachments, 'tkt_77')
    expect(out.attachmentCount).toBe(2)
  })

  it('sets platform to cognigy', () => {
    const out = transformMessage(raw, 'tkt_77')
    expect(out.platform).toBe('cognigy')
  })

  it('passes MessageSchema.parse', () => {
    const out = transformMessage(raw, 'tkt_77')
    expect(() => MessageSchema.parse(out)).not.toThrow()
  })

  it('falls back to epoch-0 when created_at is undefined', () => {
    // epochToIso returns undefined for falsy input (0 is falsy); toIso(undefined) also returns
    // undefined; so the fallback new Date(0).toISOString() is used.
    const out = transformMessage({ id: 1, content: 'hi' }, 'tkt_1')
    expect(out.createdAt).toBe(new Date(0).toISOString())
  })
})
