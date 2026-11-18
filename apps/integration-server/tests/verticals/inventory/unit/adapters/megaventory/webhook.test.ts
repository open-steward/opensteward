import { describe, it, expect } from 'vitest'
import { createHmac, randomBytes } from 'node:crypto'
import {
  verifyMegaventoryWebhook,
  parseMegaventoryWebhookEvents,
} from '../../../../../../src/verticals/inventory/adapters/megaventory/webhook'
import { WebhookEventSchema } from '../../../../../../src/verticals/inventory/schema/webhook'

/**
 * Megaventory exchanges no signing secret.
 *
 * `EventSubscriptionAdd`'s entire request body, read from the live service
 * metadata on 2026-09-18, is
 *   { APIKEY, mvEvent: { EventID, EventType, Application, ListenerURL } }
 * with no secret field, and the response returns none either. Megaventory has
 * nothing to sign with and a receiver has nothing to verify against.
 */
describe('megaventory webhook verification', () => {
  it('fails closed, because no callback can be authenticated', () => {
    const body = Buffer.from('{"mvEvent":{"EventType":"x"}}')
    expect(verifyMegaventoryWebhook(body, {}, 'whatever')).toBe(false)
  })

  it('does not accept the fabricated Cin7-style signature it used to', () => {
    // The previous verifier claimed an HMAC-SHA256 hex digest in
    // x-megaventory-signature. Megaventory sends no such header and could not
    // compute one.
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyMegaventoryWebhook(body, { 'x-megaventory-signature': sig }, secret)).toBe(false)
  })

  it('cannot be satisfied by any header a caller invents', () => {
    const body = Buffer.from('{}')
    const headers = {
      'x-megaventory-signature': randomBytes(32).toString('hex'),
      'webhook-signature': randomBytes(32).toString('base64'),
      authorization: 'Bearer anything',
    }
    expect(verifyMegaventoryWebhook(body, headers, 'secret')).toBe(false)
  })
})

describe('megaventory webhook parsing', () => {
  it('produces an event that satisfies the canonical schema', () => {
    for (const e of parseMegaventoryWebhookEvents({
      mvEvent: { EventID: 12, EventType: 'ProductUpdated', Application: 'OpenSteward' },
    })) {
      expect(() => WebhookEventSchema.parse(e)).not.toThrow()
    }
  })

  it('passes the vendor event type through verbatim', () => {
    const [e] = parseMegaventoryWebhookEvents({
      mvEvent: { EventID: 12, EventType: 'ProductUpdated' },
    })
    expect(e!.type).toBe('ProductUpdated')
    expect(e!.platform).toBe('megaventory')
  })

  it('classifies as unknown rather than guessing a resource from the name', () => {
    // The permitted EventType values are not enumerated anywhere in the live
    // metadata, so mapping "ProductUpdated" to the products resource would be
    // inferring a contract from a string that happens to read well.
    const [e] = parseMegaventoryWebhookEvents({ mvEvent: { EventType: 'ProductUpdated' } })
    expect(e!.resourceType).toBe('unknown')
    expect(e!.action).toBe('unknown')
  })

  it('does not resurrect the Cin7 event names', () => {
    const [e] = parseMegaventoryWebhookEvents({ Type: 'Stock.OnHandChanged', Data: { ID: 'p1' } })
    expect(JSON.stringify(e)).not.toContain('cin7')
    expect(e!.resourceType).toBe('unknown')
  })
})
