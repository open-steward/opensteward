import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  type RawLivehelpnowTicketAction,
} from '../../../../../../../src/verticals/customer-support/adapters/livehelpnow/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'

describe('livehelpnow transformMessage', () => {
  it('synthesises id from ticketId and index', () => {
    const raw: RawLivehelpnowTicketAction = { action: 'reply', action_log: 'Hello' }
    const result = transformMessage(raw, 'tkt-10', 3)
    expect(result.id).toBe('tkt-10:action:3')
    expect(result.externalId).toBe('tkt-10:action:3')
  })

  it('maps private=true to type internal', () => {
    const raw: RawLivehelpnowTicketAction = {
      action: 'note',
      action_log: 'Internal note',
      private: true,
    }
    const result = transformMessage(raw, 'tkt-1', 0)
    expect(result.type).toBe('internal')
  })

  it('maps private=false to type public', () => {
    const raw: RawLivehelpnowTicketAction = {
      action: 'reply',
      action_log: 'Public reply',
      private: false,
    }
    const result = transformMessage(raw, 'tkt-1', 1)
    expect(result.type).toBe('public')
  })

  it('maps operator_id present to authorType user', () => {
    const raw: RawLivehelpnowTicketAction = { action: 'reply', action_log: 'Hi', operator_id: 42 }
    const result = transformMessage(raw, 'tkt-2', 0)
    expect(result.authorType).toBe('user')
    expect(result.authorId).toBe('42')
  })

  it('maps absent operator_id to authorType contact', () => {
    const raw: RawLivehelpnowTicketAction = { action: 'message', action_log: 'Customer message' }
    const result = transformMessage(raw, 'tkt-2', 1)
    expect(result.authorType).toBe('contact')
    expect(result.authorId).toBe('')
  })

  it('prefers action_log over action for body', () => {
    const raw: RawLivehelpnowTicketAction = {
      action: 'raw action',
      action_log: 'The real log message',
    }
    const result = transformMessage(raw, 'tkt-3', 0)
    expect(result.body).toBe('The real log message')
  })

  it('falls back to action when action_log absent', () => {
    const raw: RawLivehelpnowTicketAction = { action: 'ticket opened' }
    const result = transformMessage(raw, 'tkt-3', 1)
    expect(result.body).toBe('ticket opened')
  })

  it('sets ticketId from argument', () => {
    const raw: RawLivehelpnowTicketAction = { action: 'reply', action_log: 'x' }
    const result = transformMessage(raw, 'ticket-77', 0)
    expect(result.ticketId).toBe('ticket-77')
  })

  it('sets platform to livehelpnow', () => {
    const raw: RawLivehelpnowTicketAction = { action: 'reply', action_log: 'y' }
    const result = transformMessage(raw, 'tkt-4', 0)
    expect(result.platform).toBe('livehelpnow')
  })

  it('passes MessageSchema validation for a contact message', () => {
    const raw: RawLivehelpnowTicketAction = {
      action: 'message',
      action_log: 'I need help with my account.',
      private: false,
      action_date: '2026-01-15T09:30:00.000Z',
    }
    const result = transformMessage(raw, 'tkt-99', 0)
    // authorType 'contact' is in schema — should pass
    expect(() => MessageSchema.parse(result)).not.toThrow()
  })

  it('passes MessageSchema validation for an agent message', () => {
    const raw: RawLivehelpnowTicketAction = {
      action: 'reply',
      action_log: 'Thanks for contacting us.',
      operator_id: 5,
      private: false,
      action_date: '2026-01-15T09:30:00.000Z',
    }
    const result = transformMessage(raw, 'tkt-100', 1)
    // authorType 'user' is in schema — should pass
    expect(() => MessageSchema.parse(result)).not.toThrow()
  })
})
