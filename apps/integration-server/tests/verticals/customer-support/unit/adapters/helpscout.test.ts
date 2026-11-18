/**
 * Help Scout: X-HelpScout-Signature = base64(HMAC-SHA1(secret, raw body)), no
 * timestamp. The event name is in X-HelpScout-Event.
 * https://developer.helpscout.com/webhooks/ (fetched 2026-09-28)
 */
import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyHelpScoutWebhook,
  parseHelpScoutWebhookEvents,
} from '../../../../../src/verticals/customer-support/adapters/helpscout/webhook'
import { WebhookEventSchema } from '../../../../../src/verticals/customer-support/schema/webhook'

// The vendor's published vector (updated Ruby example): "or use signature =
// 'I1KlvGppYqvFTJgJ9jezdQMDiyI=' which is an actual signature of the data above".
const VECTOR_SECRET = 'your secret key'
const VECTOR_BODY = Buffer.from(
  '{"ticket":{"id":"1","number":"2"},"customer":{"id":"1","fname":"Jackie","lname":"Chan","email":"jackie.chan@somewhere.com","emails":["jackie.chan@somewhere.com"]}}',
)
const VECTOR_SIG = 'I1KlvGppYqvFTJgJ9jezdQMDiyI='

const SECRET = 'hs-webhook-secret'
const BODY = Buffer.from(JSON.stringify({ id: 12345, number: 42, subject: 'Refund — café' }))
const sign = (body: Buffer, secret = SECRET) =>
  createHmac('sha1', secret).update(body).digest('base64')

describe('verifyHelpScoutWebhook', () => {
  it('accepts the vendor-published vector', () => {
    expect(
      verifyHelpScoutWebhook(VECTOR_BODY, { 'x-helpscout-signature': VECTOR_SIG }, VECTOR_SECRET),
    ).toBe(true)
  })

  it('accepts a signature over the raw bytes, whatever the header case', () => {
    expect(verifyHelpScoutWebhook(BODY, { 'x-helpscout-signature': sign(BODY) }, SECRET)).toBe(true)
    expect(verifyHelpScoutWebhook(BODY, { 'X-HelpScout-Signature': sign(BODY) }, SECRET)).toBe(true)
  })

  it('rejects the stale sample signature the page also shows', () => {
    expect(
      verifyHelpScoutWebhook(
        VECTOR_BODY,
        { 'x-helpscout-signature': '+oNIxipGoqx4t2BmkBHbXKc6VHM=' },
        VECTOR_SECRET,
      ),
    ).toBe(false)
  })

  it('rejects a tampered body', () => {
    const tampered = Buffer.from(VECTOR_BODY.toString('utf8').replace('Jackie', 'Jacky'))
    expect(
      verifyHelpScoutWebhook(tampered, { 'x-helpscout-signature': VECTOR_SIG }, VECTOR_SECRET),
    ).toBe(false)
  })

  it('rejects a re-serialised body (signs raw bytes, not parsed JSON)', () => {
    const pretty = Buffer.from(JSON.stringify(JSON.parse(VECTOR_BODY.toString('utf8')), null, 2))
    expect(
      verifyHelpScoutWebhook(pretty, { 'x-helpscout-signature': VECTOR_SIG }, VECTOR_SECRET),
    ).toBe(false)
  })

  it('rejects a signature made with another secret', () => {
    expect(
      verifyHelpScoutWebhook(VECTOR_BODY, { 'x-helpscout-signature': VECTOR_SIG }, 'other'),
    ).toBe(false)
  })

  it('rejects a SHA-256 or hex signature over the same body', () => {
    const sha256 = createHmac('sha256', SECRET).update(BODY).digest('base64')
    const hex = createHmac('sha1', SECRET).update(BODY).digest('hex')
    expect(verifyHelpScoutWebhook(BODY, { 'x-helpscout-signature': sha256 }, SECRET)).toBe(false)
    expect(verifyHelpScoutWebhook(BODY, { 'x-helpscout-signature': hex }, SECRET)).toBe(false)
  })

  it('rejects a missing or empty signature header', () => {
    expect(verifyHelpScoutWebhook(BODY, {}, SECRET)).toBe(false)
    expect(verifyHelpScoutWebhook(BODY, { 'x-helpscout-signature': '' }, SECRET)).toBe(false)
    // The event header alone is not authentication.
    expect(verifyHelpScoutWebhook(BODY, { 'x-helpscout-event': 'convo.created' }, SECRET)).toBe(
      false,
    )
  })

  it('rejects wrong-length signatures without throwing', () => {
    const good = sign(BODY)
    expect(
      verifyHelpScoutWebhook(BODY, { 'x-helpscout-signature': good.slice(0, 10) }, SECRET),
    ).toBe(false)
    expect(verifyHelpScoutWebhook(BODY, { 'x-helpscout-signature': good + 'AA' }, SECRET)).toBe(
      false,
    )
  })

  it('rejects a same-length signature that differs in one character', () => {
    const good = sign(BODY)
    const flipped = (good[0] === 'A' ? 'B' : 'A') + good.slice(1)
    expect(flipped.length).toBe(good.length)
    expect(verifyHelpScoutWebhook(BODY, { 'x-helpscout-signature': flipped }, SECRET)).toBe(false)
  })

  it('fails closed on an empty secret, even when signed with the empty key', () => {
    // The router verifies unconfigured adapters with key ''.
    expect(verifyHelpScoutWebhook(BODY, { 'x-helpscout-signature': sign(BODY, '') }, '')).toBe(
      false,
    )
  })
})

describe('parseHelpScoutWebhookEvents', () => {
  const convo = { id: 12345, number: 42, subject: 'Refund' }
  const cases: Array<[string, Record<string, unknown>, string, string, string]> = [
    ['convo.created', convo, 'tickets', 'created', '12345'],
    ['convo.assigned', convo, 'tickets', 'assigned', '12345'],
    ['convo.status', convo, 'tickets', 'updated', '12345'],
    ['convo.deleted', { id: 12345 }, 'tickets', 'deleted', '12345'],
    ['convo.customer.reply.created', convo, 'messages', 'commented', '12345'],
    ['convo.note.created', convo, 'messages', 'commented', '12345'],
    ['customer.updated', { id: 500 }, 'contacts', 'updated', '500'],
    ['tag.deleted', { id: 9 }, 'tags', 'deleted', '9'],
    [
      'satisfaction.ratings',
      { id: 1, threadId: 10, conversationId: 123, rating: 'Great' },
      'tickets',
      'rated',
      '123',
    ],
    ['beacon.chat.created', { id: 'c1' }, 'unknown', 'unknown', 'c1'],
  ]

  for (const [event, body, resourceType, action, resourceId] of cases) {
    it(`maps ${event} from the X-HelpScout-Event header`, () => {
      const [e] = parseHelpScoutWebhookEvents(body, { 'x-helpscout-event': event })
      expect(WebhookEventSchema.parse(e)).toMatchObject({
        platform: 'helpscout',
        type: event,
        resourceType,
        action,
        resourceId,
      })
      expect(e!.id).toBe(`helpscout:${event}:${String(body['id'])}`)
    })
  }

  it('sets ticketId on message events to the conversation id', () => {
    const [e] = parseHelpScoutWebhookEvents(convo, {
      'X-HelpScout-Event': 'convo.agent.reply.created',
    })
    expect(e!.ticketId).toBe('12345')
  })

  it('does not read an event name from the body', () => {
    const [e] = parseHelpScoutWebhookEvents({
      id: 1,
      type: 'convo.created',
      event: 'convo.created',
    })
    expect(e).toMatchObject({
      type: '',
      resourceType: 'unknown',
      action: 'unknown',
      resourceId: '1',
    })
  })
})
