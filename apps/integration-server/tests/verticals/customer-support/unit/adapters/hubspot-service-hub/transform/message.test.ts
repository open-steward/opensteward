/**
 * HubSpot Service Hub message transform.
 *
 * Fixtures (../fixtures/messages.ts) are HubSpot's own examples. The MESSAGE and WELCOME_MESSAGE rows
 * are the documented response of
 * `GET /conversations/v3/conversations/threads/{threadId}/messages`
 * (developers.hubspot.com/docs/api-reference/legacy/conversations/guide,
 * "Get actors"). The COMMENT row is the guide's documented comment body
 * ("type": "COMMENT", "text": "Can you follow up?") carrying the fields the
 * Conversations v3 spec (api.hubspot.com/public/api/spec/v2/specs/release/22196/version/3)
 * marks required on `PublicComment`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  isBodyMessage,
  type RawHubspotMessage,
} from '../../../../../../../src/verticals/customer-support/adapters/hubspot-service-hub/transform/message'
import { DOC_INCOMING_MESSAGE, DOC_WELCOME_MESSAGE, DOC_COMMENT } from '../fixtures/messages'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'

describe('hubspot-service-hub transformMessage', () => {
  it('maps the documented incoming MESSAGE to a public contact message', () => {
    const m = MessageSchema.parse(transformMessage(DOC_INCOMING_MESSAGE, '12345'))
    expect(m.id).toBe('3ad3474b08dd408ca57a8454e355e942')
    expect(m.externalId).toBe('3ad3474b08dd408ca57a8454e355e942')
    expect(m.ticketId).toBe('12345')
    expect(m.authorId).toBe('V-1401')
    expect(m.authorType).toBe('contact')
    expect(m.body).toBe('hi yes hello')
    expect(m.type).toBe('public')
    expect(m.attachmentCount).toBe(0)
    expect(m.createdAt).toBe('2019-11-18T18:47:59.949Z')
    expect(m.platform).toBe('hubspot-service-hub')
    expect(m.metadata).toEqual({
      messageType: 'MESSAGE',
      threadId: '176347007',
      direction: 'INCOMING',
    })
  })

  it('maps the documented WELCOME_MESSAGE from the S- system actor', () => {
    const m = MessageSchema.parse(transformMessage(DOC_WELCOME_MESSAGE, '12345'))
    expect(m.authorId).toBe('S-hubspot')
    expect(m.authorType).toBe('system')
    expect(m.type).toBe('public')
    expect(m.body).toBe("Got any questions? I'm happy to help.")
    expect(m.attachmentCount).toBeUndefined()
  })

  it('maps a COMMENT ("Comments only appear in the inbox") to internal, from an A- agent', () => {
    const m = MessageSchema.parse(transformMessage(DOC_COMMENT, '12345'))
    expect(m.type).toBe('internal')
    expect(m.authorType).toBe('user')
    expect(m.authorId).toBe('A-2620022')
    expect(m.body).toBe('Can you follow up?')
  })

  it('counts only FILE attachments, not message headers', () => {
    expect(transformMessage(DOC_COMMENT, '12345').attachmentCount).toBe(1)
  })

  it('reads the body from `text` only, never falling back to richText', () => {
    const m = MessageSchema.parse(
      transformMessage({ ...DOC_COMMENT, text: '', richText: '<p>html only</p>' }, '12345'),
    )
    expect(m.body).toBe('')
  })

  it('maps actor prefixes the guide does not tie to a canonical author as unknown', () => {
    for (const createdBy of ['I-1234', 'L-55', 'E-someone@example.test']) {
      const m = MessageSchema.parse(transformMessage({ ...DOC_COMMENT, createdBy }, '12345'))
      expect(m.authorType).toBe('unknown')
      expect(m.authorId).toBe(createdBy)
    }
  })

  it('throws rather than inventing a timestamp when createdAt is not a date', () => {
    expect(() => transformMessage({ ...DOC_COMMENT, createdAt: 'nope' }, '12345')).toThrow(
      /createdAt/,
    )
  })

  it('throws rather than inventing a body when a body type has no text', () => {
    const { text: _drop, ...noText } = DOC_COMMENT
    expect(() => transformMessage(noText as RawHubspotMessage, '12345')).toThrow(/no text/)
  })

  it('isBodyMessage keeps MESSAGE, COMMENT and WELCOME_MESSAGE and drops the event types', () => {
    expect(isBodyMessage(DOC_INCOMING_MESSAGE)).toBe(true)
    expect(isBodyMessage(DOC_COMMENT)).toBe(true)
    expect(isBodyMessage(DOC_WELCOME_MESSAGE)).toBe(true)
    for (const type of ['ASSIGNMENT', 'THREAD_STATUS_CHANGE', 'THREAD_INBOX_CHANGE']) {
      expect(isBodyMessage({ ...DOC_COMMENT, type })).toBe(false)
    }
  })
})
