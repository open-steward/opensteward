/**
 * Haptik transforms.
 *
 * transformMessage fixtures are the documented "Get Chat Transcripts v2.0"
 * JSON response, verbatim, from
 * https://docs.haptik.ai/en_US/developer-guides/what-are-the-different-apis-that-can-be-used-on-conversation-studio
 */
import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  parseHaptikTimestamp,
  type RawHaptikMessage,
} from '../../../../../src/verticals/customer-support/adapters/haptik/transform/message'
import {
  transformContact,
  type RawHaptikUser,
} from '../../../../../src/verticals/customer-support/adapters/haptik/transform/contact'
import { MessageSchema } from '../../../../../src/verticals/customer-support/schema/message'
import { ContactSchema } from '../../../../../src/verticals/customer-support/schema/contact'

// The documented example response.
const documented: { chat_json: RawHaptikMessage[] } = {
  chat_json: [
    {
      text: 'Search places to visit{task}',
      sender: 'user',
      message_id: 1742,
      timestamp: '06/22/20 07:24:25 AM UTC',
    },
    {
      text: 'TEXT',
      sender: 'bot',
      message_id: 1743,
      timestamp: '06/22/20 07:24:26 AM UTC',
    },
  ],
}

const TICKET = '1234:ab112468917fgghdebc:2'
const USER = 'ab112468917fgghdebc'

// ── transformMessage ───────────────────────────────────────────────────────────

describe('Haptik transformMessage', () => {
  const [userMsg, botMsg] = documented.chat_json as [RawHaptikMessage, RawHaptikMessage]

  it('parses the documented response with MessageSchema', () => {
    for (const raw of documented.chat_json) {
      expect(() => MessageSchema.parse(transformMessage(raw, TICKET, USER))).not.toThrow()
    }
  })

  it('maps message_id, text and the ticket id', () => {
    const msg = MessageSchema.parse(transformMessage(userMsg, TICKET, USER))
    expect(msg.id).toBe('1742')
    expect(msg.externalId).toBe('1742')
    expect(msg.ticketId).toBe(TICKET)
    expect(msg.body).toBe('Search places to visit{task}')
    expect(msg.type).toBe('public')
    expect(msg.platform).toBe('haptik')
  })

  it('parses the documented MM/DD/YY hh:mm:ss AM UTC timestamp', () => {
    expect(transformMessage(userMsg, TICKET, USER).createdAt).toBe('2020-06-22T07:24:25.000Z')
    expect(transformMessage(botMsg, TICKET, USER).createdAt).toBe('2020-06-22T07:24:26.000Z')
  })

  it('sender user is the contact, identified by the transcript user_name', () => {
    const msg = transformMessage(userMsg, TICKET, USER)
    expect(msg.authorType).toBe('contact')
    expect(msg.authorId).toBe(USER)
  })

  it('sender bot is the system', () => {
    const msg = transformMessage(botMsg, TICKET, USER)
    expect(msg.authorType).toBe('system')
    expect(msg.authorId).toBe('bot')
  })

  it('any other sender is the named agent', () => {
    const msg = MessageSchema.parse(
      transformMessage({ ...userMsg, sender: 'Prateek' }, TICKET, USER),
    )
    expect(msg.authorType).toBe('user')
    expect(msg.authorId).toBe('Prateek')
    expect(msg.metadata).toEqual({ sender: 'Prateek' })
  })

  it('throws, rather than inventing a date, on an undocumented timestamp', () => {
    expect(() => transformMessage({ ...userMsg, timestamp: undefined }, TICKET, USER)).toThrow(
      /timestamp/,
    )
    expect(() =>
      transformMessage({ ...userMsg, timestamp: '2020-06-22T07:24:25Z' }, TICKET, USER),
    ).toThrow(/timestamp/)
  })

  it('throws, rather than inventing an id, when message_id is missing', () => {
    expect(() => transformMessage({ ...userMsg, message_id: undefined }, TICKET, USER)).toThrow(
      /message_id/,
    )
  })

  it('throws when sender is missing', () => {
    expect(() => transformMessage({ ...userMsg, sender: undefined }, TICKET, USER)).toThrow(
      /sender/,
    )
  })
})

describe('parseHaptikTimestamp', () => {
  it('12 AM is midnight and 12 PM is noon', () => {
    expect(parseHaptikTimestamp('01/02/21 12:05:00 AM UTC')).toBe('2021-01-02T00:05:00.000Z')
    expect(parseHaptikTimestamp('01/02/21 12:05:00 PM UTC')).toBe('2021-01-02T12:05:00.000Z')
    expect(parseHaptikTimestamp('01/02/21 01:05:00 PM UTC')).toBe('2021-01-02T13:05:00.000Z')
  })

  it('rejects a timestamp in any zone but the documented UTC', () => {
    expect(() => parseHaptikTimestamp('06/22/20 07:24:25 AM IST')).toThrow(/MM\/DD\/YY/)
    expect(() => parseHaptikTimestamp('06/22/20 07:24:25 AM')).toThrow(/MM\/DD\/YY/)
    expect(() => parseHaptikTimestamp('06/22/20 07:24:25 AM UTC+05:30')).toThrow(/MM\/DD\/YY/)
  })

  it('rejects an impossible date', () => {
    expect(() => parseHaptikTimestamp('02/30/21 01:00:00 AM UTC')).toThrow(/valid date/)
  })
})

// ── transformContact ───────────────────────────────────────────────────────────

describe('Haptik transformContact', () => {
  const base: RawHaptikUser = {
    auth_id: 'auth_abc123',
    name: 'Alice Smith',
    email: 'alice@example.com',
    mobile_no: '+15550001234',
  }

  it('parses with ContactSchema and maps auth_id, name, email, phone', () => {
    const contact = ContactSchema.parse(transformContact(base))
    expect(contact.id).toBe('auth_abc123')
    expect(contact.externalId).toBe('auth_abc123')
    expect(contact.name).toBe('Alice Smith')
    expect(contact.email).toBe('alice@example.com')
    expect(contact.phone).toBe('+15550001234')
    expect(contact.platform).toBe('haptik')
  })

  it('does not throw when optional fields are null', () => {
    expect(() =>
      ContactSchema.parse(
        transformContact({ auth_id: 'x', name: null, email: null, mobile_no: null }),
      ),
    ).not.toThrow()
  })
})
