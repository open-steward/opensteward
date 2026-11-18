import { describe, it, expect } from 'vitest'
import { transformMessage, transformMessages } from '../../../../../src/verticals/customer-support/adapters/clearfeed/transform/message'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/clearfeed/transform/ticket'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/clearfeed/transform/contact'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/clearfeed/transform/team'
import { ClearfeedAdapter } from '../../../../../src/verticals/customer-support/adapters/clearfeed/index'

describe('ClearFeed message transform', () => {
  it('maps is_responder=true to authorType=user', () => {
    const msg = transformMessage({ ts: '1700000000.000000', text: 'hello', is_responder: true }, 'tkt1')
    expect(msg.authorType).toBe('user')
  })

  it('maps is_responder=false to authorType=contact', () => {
    const msg = transformMessage({ ts: '1700000000.000001', text: 'hello', is_responder: false }, 'tkt1')
    expect(msg.authorType).toBe('contact')
  })

  it('maps is_responder=null to authorType=contact', () => {
    const msg = transformMessage({ ts: '1700000000.000002', text: 'hi', is_responder: null }, 'tkt2')
    expect(msg.authorType).toBe('contact')
  })

  it('maps is_private=true to type=internal', () => {
    const msg = transformMessage({ ts: '1700000000.000003', is_private: true }, 'tkt3')
    expect(msg.type).toBe('internal')
  })

  it('maps is_private=false to type=public', () => {
    const msg = transformMessage({ ts: '1700000000.000004', is_private: false }, 'tkt3')
    expect(msg.type).toBe('public')
  })

  it('sets platform=clearfeed', () => {
    const msg = transformMessage({ ts: '1700000000.000005', text: 'test' }, 'tkt4')
    expect(msg.platform).toBe('clearfeed')
  })

  it('parses Slack ts into ISO 8601 createdAt', () => {
    const ts = '1700000000.123456'
    const msg = transformMessage({ ts }, 'tkt5')
    expect(msg.createdAt).toBe(new Date(1700000000.123456 * 1000).toISOString())
  })

  it('handles missing ts gracefully (no throw)', () => {
    expect(() => transformMessage({}, 'tkt6')).not.toThrow()
  })

  it('transformMessages returns empty array for non-array input', () => {
    expect(transformMessages(null, 'tkt7')).toEqual([])
    expect(transformMessages(undefined, 'tkt7')).toEqual([])
  })

  it('transformMessages maps every element', () => {
    const msgs = transformMessages(
      [{ ts: '1700000000.001', is_responder: true }, { ts: '1700000000.002', is_responder: false }],
      'tkt8',
    )
    expect(msgs).toHaveLength(2)
    expect(msgs[0]!.authorType).toBe('user')
    expect(msgs[1]!.authorType).toBe('contact')
  })
})

describe('ClearFeed ticket transform', () => {
  it('maps state=open to status=open', () => {
    const t = transformTicket({ id: 1, state: 'open' })
    expect(t.status).toBe('open')
    expect(t.platform).toBe('clearfeed')
  })

  it('maps state=solved to status=resolved', () => {
    const t = transformTicket({ id: 2, state: 'solved' })
    expect(t.status).toBe('resolved')
  })

  it('maps state=closed to status=closed', () => {
    const t = transformTicket({ id: 3, state: 'closed' })
    expect(t.status).toBe('closed')
  })

  it('sets channel=chat (Slack-native)', () => {
    const t = transformTicket({ id: 4 })
    expect(t.channel).toBe('chat')
  })

  it('handles missing fields gracefully', () => {
    expect(() => transformTicket({ id: 5 })).not.toThrow()
  })
})

describe('ClearFeed contact transform', () => {
  it('maps id and name', () => {
    const c = transformContact({ id: 10, name: 'Acme Corp' })
    expect(c.id).toBe('10')
    expect(c.name).toBe('Acme Corp')
    expect(c.platform).toBe('clearfeed')
  })

  it('extracts first portal_users email', () => {
    const c = transformContact({ id: 11, portal_users: [{ email: 'user@acme.com' }] })
    expect(c.email).toBe('user@acme.com')
  })

  it('handles missing portal_users gracefully', () => {
    expect(() => transformContact({ id: 12 })).not.toThrow()
  })
})

describe('ClearFeed team transform', () => {
  it('maps id and name', () => {
    const t = transformTeam({ id: 20, name: 'Support Team' })
    expect(t.id).toBe('20')
    expect(t.name).toBe('Support Team')
    expect(t.platform).toBe('clearfeed')
  })
})

describe('ClearfeedAdapter', () => {
  it('has platform=clearfeed', () => {
    const adapter = new ClearfeedAdapter()
    expect(adapter.platform).toBe('clearfeed')
  })

  it('does NOT expose verifyWebhook (fails closed — 501)', () => {
    const adapter = new ClearfeedAdapter()
    expect('verifyWebhook' in adapter).toBe(false)
  })

  it('does NOT expose parseWebhookEvents', () => {
    const adapter = new ClearfeedAdapter()
    expect('parseWebhookEvents' in adapter).toBe(false)
  })
})
