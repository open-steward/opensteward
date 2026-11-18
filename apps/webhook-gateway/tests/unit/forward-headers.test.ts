import { describe, it, expect } from 'vitest'
import { forwardableHeaders } from '../../src/core/forward-headers'

describe('forwardableHeaders', () => {
  it('keeps every provider signature scheme, not just x-* and two names', () => {
    const out = forwardableHeaders({
      'content-type': 'application/json',
      'intuit-signature': 'q1',
      'webhook-id': 'msg_1',
      'webhook-timestamp': '1700000000',
      'webhook-signature': 'v1,abc',
      'svix-id': 's1',
      'svix-timestamp': '1700000000',
      'svix-signature': 'v1,def',
      'paddle-signature': 'ts=1;h1=x',
      'stripe-signature': 't=1,v1=y',
      'x-shopify-hmac-sha256': 'z',
      authorization: 'Basic dXNlcjpwYXNz',
    })
    expect(out).toEqual({
      'content-type': 'application/json',
      'intuit-signature': 'q1',
      'webhook-id': 'msg_1',
      'webhook-timestamp': '1700000000',
      'webhook-signature': 'v1,abc',
      'svix-id': 's1',
      'svix-timestamp': '1700000000',
      'svix-signature': 'v1,def',
      'paddle-signature': 'ts=1;h1=x',
      'stripe-signature': 't=1,v1=y',
      'x-shopify-hmac-sha256': 'z',
      authorization: 'Basic dXNlcjpwYXNz',
    })
  })

  it('drops hop-by-hop, host/length, cookies, internal secrets and client x-forwarded-*', () => {
    const out = forwardableHeaders({
      host: 'gw.example',
      'content-length': '12',
      connection: 'keep-alive, x-drop-me',
      'keep-alive': 'timeout=5',
      'transfer-encoding': 'chunked',
      upgrade: 'h2c',
      te: 'trailers',
      trailer: 'x-t',
      'proxy-authorization': 'Basic x',
      cookie: 'session=1',
      'x-admin-secret': 'nope',
      'x-service-secret': 'nope',
      'x-forwarded-for': '6.6.6.6',
      'x-forwarded-host': 'evil.example',
      'x-drop-me': 'listed in Connection',
      'x-keep-me': 'ok',
    })
    expect(out).toEqual({ 'x-keep-me': 'ok' })
  })

  it('joins repeated headers and skips undefined values', () => {
    expect(forwardableHeaders({ 'x-a': ['1', '2'], 'x-b': undefined })).toEqual({ 'x-a': '1, 2' })
  })
})
