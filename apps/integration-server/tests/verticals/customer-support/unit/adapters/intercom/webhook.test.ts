/**
 * "The X-Hub-Signature header value starts with the string sha1= followed by
 * the signature": hex HMAC-SHA1 of the raw body keyed with the app's
 * client_secret.
 * https://developers.intercom.com/docs/references/webhooks/webhook-models
 */
import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyIntercomWebhook,
  parseIntercomWebhookEvents,
} from '../../../../../../src/verticals/customer-support/adapters/intercom/webhook'
import { WebhookEventSchema } from '../../../../../../src/verticals/customer-support/schema/webhook'

const SECRET = 'client-secret'
const BODY = Buffer.from(
  JSON.stringify({
    type: 'notification_event',
    id: 'notif_78c122d0',
    topic: 'conversation.user.replied',
    app_id: 'a86dr8yl',
    data: { type: 'notification_event_data', item: { type: 'conversation', id: '471' } },
  }),
)
const sign = (body: Buffer, secret = SECRET) =>
  'sha1=' + createHmac('sha1', secret).update(body).digest('hex')

describe('verifyIntercomWebhook', () => {
  it('accepts the documented sha1= signature, whatever the header case', () => {
    expect(verifyIntercomWebhook(BODY, { 'x-hub-signature': sign(BODY) }, SECRET)).toBe(true)
    expect(verifyIntercomWebhook(BODY, { 'X-Hub-Signature': sign(BODY) }, SECRET)).toBe(true)
  })

  it('rejects a signature made with another secret', () => {
    expect(verifyIntercomWebhook(BODY, { 'x-hub-signature': sign(BODY, 'other') }, SECRET)).toBe(
      false,
    )
  })

  it('rejects a tampered body', () => {
    const tampered = Buffer.from(BODY.toString().replace('471', '472'))
    expect(verifyIntercomWebhook(tampered, { 'x-hub-signature': sign(BODY) }, SECRET)).toBe(false)
  })

  it('rejects the hex without its sha1= prefix, a missing header and an empty secret', () => {
    const bare = sign(BODY).slice('sha1='.length)
    expect(verifyIntercomWebhook(BODY, { 'x-hub-signature': bare }, SECRET)).toBe(false)
    expect(verifyIntercomWebhook(BODY, {}, SECRET)).toBe(false)
    expect(verifyIntercomWebhook(BODY, { 'x-hub-signature': sign(BODY, '') }, '')).toBe(false)
  })

  it('rejects the scheme the Zendesk copy used to accept (timestamp + base64 SHA-256)', () => {
    const ts = '1700000000'
    const zendeskStyle = createHmac('sha256', SECRET)
      .update(Buffer.concat([Buffer.from(ts), BODY]))
      .digest('base64')
    expect(
      verifyIntercomWebhook(
        BODY,
        { 'x-intercom-signature': zendeskStyle, 'x-intercom-signature-timestamp': ts },
        SECRET,
      ),
    ).toBe(false)
  })
})

describe('parseIntercomWebhookEvents', () => {
  it('maps a reply topic to a message on the conversation, keyed by the notification id', () => {
    const [evt] = parseIntercomWebhookEvents(JSON.parse(BODY.toString()))
    expect(WebhookEventSchema.parse(evt)).toMatchObject({
      id: 'notif_78c122d0',
      platform: 'intercom',
      type: 'conversation.user.replied',
      resourceType: 'messages',
      action: 'commented',
      resourceId: '471',
      ticketId: '471',
    })
  })

  it.each([
    ['conversation.user.created', 'tickets', 'created'],
    ['conversation.admin.closed', 'tickets', 'closed'],
    ['conversation.admin.opened', 'tickets', 'reopened'],
    ['conversation.admin.assigned', 'tickets', 'assigned'],
    ['conversation.rating.added', 'tickets', 'rated'],
    ['conversation.admin.noted', 'messages', 'commented'],
    ['contact.user.created', 'contacts', 'created'],
    ['contact.lead.updated', 'contacts', 'updated'],
    ['contact.deleted', 'contacts', 'deleted'],
    ['content_stat.series', 'unknown', 'unknown'],
  ])('%s → %s/%s', (topic, resourceType, action) => {
    const [evt] = parseIntercomWebhookEvents({ topic, id: 'n1', data: { item: { id: 'x' } } })
    const parsed = WebhookEventSchema.parse(evt)
    expect(parsed.resourceType).toBe(resourceType)
    expect(parsed.action).toBe(action)
    expect(parsed.resourceId).toBe('x')
  })
})
