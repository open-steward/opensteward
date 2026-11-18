import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyLiveChatWebhook,
  parseLiveChatWebhookEvents,
} from '../../../../../src/verticals/customer-support/adapters/livechat/webhook'
import { LiveChatAdapter } from '../../../../../src/verticals/customer-support/adapters/livechat/index'
import { LiveChatClient } from '../../../../../src/verticals/customer-support/adapters/livechat/client'

describe('LiveChat webhook', () => {
  it('verifies HMAC-SHA256', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const ts = '1700000000'
    const sig = createHmac('sha256', secret)
      .update(Buffer.concat([Buffer.from(ts), body]))
      .digest('base64')
    expect(
      verifyLiveChatWebhook(
        body,
        { 'x-livechat-signature': sig, 'x-livechat-signature-timestamp': ts },
        secret,
      ),
    ).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyLiveChatWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=livechat', () => {
    const out = parseLiveChatWebhookEvents({ type: 'ticket.created', detail: { id: 't1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('livechat')
  })
})

describe('LiveChat personal access token auth', () => {
  const adapter = new LiveChatAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

  it('asks for the account ID and the personal access token', () => {
    expect(adapter.credentialFields().map((f) => f.name)).toEqual([
      'accountId',
      'personalAccessToken',
    ])
  })

  it('stores base64(account_id:PAT) and sends it with the Basic scheme', async () => {
    const creds = await adapter.exchangeCredentials({
      accountId: ' acc-1 ',
      personalAccessToken: 'pat-2',
    })
    expect(creds.accessToken).toBe(Buffer.from('acc-1:pat-2').toString('base64'))
    const client = new LiveChatClient(creds) as unknown as {
      http: { defaults: { headers: Record<string, unknown> } }
    }
    expect(client.http.defaults.headers['Authorization']).toBe(
      `Basic ${Buffer.from('acc-1:pat-2').toString('base64')}`,
    )
  })

  it('rejects a missing account ID or token', async () => {
    await expect(adapter.exchangeCredentials({ accountId: 'a' })).rejects.toThrow()
    await expect(adapter.exchangeCredentials({ personalAccessToken: 'p' })).rejects.toThrow()
  })
})
