import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyGallaboxWebhook,
  parseGallaboxWebhookEvents,
} from '../../../../../src/verticals/customer-support/adapters/gallabox/webhook'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/gallabox/transform/contact'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/gallabox/transform/user'

describe('Gallabox webhook', () => {
  it('verifies HMAC-SHA256 hex signature', () => {
    const secret = 'test-secret'
    const body = Buffer.from('{"event":"conversation.created"}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyGallaboxWebhook(body, { 'x-gallabox-signature': sig }, secret)).toBe(true)
  })

  it('rejects a wrong signature', () => {
    const body = Buffer.from('{}')
    expect(verifyGallaboxWebhook(body, { 'x-gallabox-signature': 'badsig' }, 'secret')).toBe(false)
  })

  it('rejects missing signature header', () => {
    expect(verifyGallaboxWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=gallabox', () => {
    const out = parseGallaboxWebhookEvents({ event: 'conversation.created', data: { _id: 'c1' } })
    expect(Array.isArray(out)).toBe(true)
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('gallabox')
  })

  it('parseEvents maps conversation.created to tickets/created', () => {
    const out = parseGallaboxWebhookEvents({ event: 'conversation.created', data: { _id: 'c42' } })
    expect(out[0]!.resourceType).toBe('tickets')
    expect(out[0]!.action).toBe('created')
    expect(out[0]!.resourceId).toBe('c42')
  })

  it('parseEvents maps message.received to messages/created', () => {
    const out = parseGallaboxWebhookEvents({
      event: 'message.received',
      data: { message: { _id: 'm1' }, conversation: { _id: 'c1' } },
    })
    expect(out[0]!.resourceType).toBe('messages')
    expect(out[0]!.action).toBe('created')
  })

  it('parseEvents handles unknown event types', () => {
    const out = parseGallaboxWebhookEvents({ event: 'something.weird', data: {} })
    expect(out[0]!.resourceType).toBe('unknown')
    expect(out[0]!.action).toBe('unknown')
  })
})

describe('Gallabox transformContact', () => {
  it('maps a contact with platform=gallabox', () => {
    const raw = {
      id: 'cnt1',
      name: 'Jane Doe',
      email: ['jane@example.com'],
      phone: ['919840985909'],
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('cnt1')
    expect(contact.platform).toBe('gallabox')
    expect(contact.name).toBe('Jane Doe')
    expect(contact.email).toBe('jane@example.com')
    expect(contact.phone).toBe('919840985909')
  })

  it('handles scalar email and phone', () => {
    const raw = { id: 'cnt2', name: 'Bob', email: 'bob@example.com', phone: '555-1234' }
    const contact = transformContact(raw)
    expect(contact.email).toBe('bob@example.com')
    expect(contact.phone).toBe('555-1234')
  })
})

describe('Gallabox transformUser', () => {
  it('maps a user with platform=gallabox', () => {
    const raw = {
      id: 'usr1',
      name: 'Agent Smith',
      email: 'smith@example.com',
      accounts: [
        {
          accountId: 'acc1',
          roleId: 'role_admin',
          availability: 'Available',
          teamIds: ['team1'],
        },
      ],
    }
    const user = transformUser(raw, 'acc1')
    expect(user.id).toBe('usr1')
    expect(user.platform).toBe('gallabox')
    expect(user.name).toBe('Agent Smith')
    expect(user.email).toBe('smith@example.com')
    expect(user.teamIds).toContain('team1')
    expect(user.role).toBe('role_admin')
  })

  it('returns empty teamIds when no accounts entry matches', () => {
    const raw = { id: 'usr2', name: 'Ghost', accounts: [] }
    const user = transformUser(raw, 'nonexistent')
    expect(user.teamIds).toEqual([])
  })
})
