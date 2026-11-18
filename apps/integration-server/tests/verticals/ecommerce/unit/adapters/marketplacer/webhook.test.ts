/**
 * Marketplacer webhook verification: a header-token compare
 * (Marketplacer-HMAC-256 is documented "only available for Operator-based
 * webhooks" — not usable by a Seller connection).
 * Docs: https://api.marketplacer.com/docs/webhooks/securingwebhooks/
 */
import { describe, it, expect } from 'vitest'
import {
  verifyMarketplacerWebhook,
  parseMarketplacerWebhookEvents,
} from '../../../../../../src/verticals/ecommerce/adapters/marketplacer/webhook'
import { WEBHOOK_TOKEN_HEADER } from '../../../../../../src/verticals/ecommerce/adapters/marketplacer/constants'

describe('verifyMarketplacerWebhook', () => {
  const secret = 'a-shared-secret-value'

  it('accepts a request whose header value matches the secret', () => {
    const headers = { [WEBHOOK_TOKEN_HEADER]: secret }
    expect(verifyMarketplacerWebhook(Buffer.from('{}'), headers, secret)).toBe(true)
  })

  it('rejects a request with the wrong header value (fail closed)', () => {
    const headers = { [WEBHOOK_TOKEN_HEADER]: 'wrong-value' }
    expect(verifyMarketplacerWebhook(Buffer.from('{}'), headers, secret)).toBe(false)
  })

  it('rejects a request with no header at all', () => {
    expect(verifyMarketplacerWebhook(Buffer.from('{}'), {}, secret)).toBe(false)
  })

  it('rejects when the connection has no secret configured', () => {
    const headers = { [WEBHOOK_TOKEN_HEADER]: '' }
    expect(verifyMarketplacerWebhook(Buffer.from('{}'), headers, '')).toBe(false)
  })

  it('is not fooled by a value that merely starts with the secret', () => {
    const headers = { [WEBHOOK_TOKEN_HEADER]: secret + 'x' }
    expect(verifyMarketplacerWebhook(Buffer.from('{}'), headers, secret)).toBe(false)
  })
})

describe('parseMarketplacerWebhookEvents', () => {
  it('maps a known __typename to its canonical resource, defaulting the action to unknown when undetermined', () => {
    const events = parseMarketplacerWebhookEvents({ __typename: 'Invoice', id: 'inv1' })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      platform: 'marketplacer',
      resourceType: 'orders',
      action: 'unknown',
      resourceId: 'inv1',
    })
  })

  it.each([
    ['Invoice', 'orders'],
    ['InvoiceAnnotation', 'orders'],
    ['RefundRequest', 'refunds'],
    ['RefundRequestLineItem', 'refunds'],
    ['ReturnShipment', 'fulfillments'],
    ['Variant', 'inventory_levels'],
  ])('maps %s to %s', (typename, resourceType) => {
    expect(parseMarketplacerWebhookEvents({ __typename: typename, id: '1' })[0]!.resourceType).toBe(
      resourceType,
    )
  })

  it('reads the action from an eventType field when present', () => {
    const events = parseMarketplacerWebhookEvents({ __typename: 'Variant', eventType: 'update', id: 'v1' })
    expect(events[0]!.action).toBe('updated')
  })

  it('reads type and action from a topic header when supplied', () => {
    const events = parseMarketplacerWebhookEvents({ id: '1' }, 'Invoice.update')
    expect(events[0]!.resourceType).toBe('orders')
    expect(events[0]!.action).toBe('updated')
  })

  it('reports unknown rather than guessing for an unrecognised type', () => {
    const events = parseMarketplacerWebhookEvents({ __typename: 'SomethingElse', id: '1' })
    expect(events[0]!.resourceType).toBe('unknown')
  })

  it('preserves the full payload', () => {
    const payload = { __typename: 'Invoice', id: '1', extra: 'x' }
    expect(parseMarketplacerWebhookEvents(payload)[0]!.payload).toBe(payload)
  })
})
