import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  type RawJitbitComment,
} from '../../../../../../../src/verticals/customer-support/adapters/jitbit-helpdesk/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'

describe('jitbit-helpdesk transformMessage', () => {
  it('maps ForTechsOnly=true to type internal', () => {
    const raw: RawJitbitComment = { CommentID: 1, IssueID: 10, ForTechsOnly: true, Body: 'Note' }
    const result = transformMessage(raw, '10')
    expect(result.type).toBe('internal')
  })

  it('maps ForTechsOnly=false to type public', () => {
    const raw: RawJitbitComment = { CommentID: 2, IssueID: 10, ForTechsOnly: false, Body: 'Reply' }
    const result = transformMessage(raw, '10')
    expect(result.type).toBe('public')
  })

  it('maps IsSystem=true to authorType system', () => {
    const raw: RawJitbitComment = { CommentID: 3, IsSystem: true, Body: 'Auto-reply' }
    const result = transformMessage(raw, '10')
    expect(result.authorType).toBe('system')
  })

  it('maps regular user to authorType user', () => {
    const raw: RawJitbitComment = { CommentID: 4, IsSystem: false, UserID: 7, Body: 'Help' }
    const result = transformMessage(raw, '10')
    expect(result.authorType).toBe('user')
  })

  it('maps UserID to authorId', () => {
    const raw: RawJitbitComment = { CommentID: 5, UserID: 42, Body: 'Hi' }
    const result = transformMessage(raw, '10')
    expect(result.authorId).toBe('42')
  })

  it('maps Body to body', () => {
    const raw: RawJitbitComment = { CommentID: 6, UserID: 1, Body: 'The message body' }
    const result = transformMessage(raw, '20')
    expect(result.body).toBe('The message body')
  })

  it('sets ticketId from argument', () => {
    const raw: RawJitbitComment = { CommentID: 7, UserID: 1, Body: 'x' }
    const result = transformMessage(raw, 'ticket-77')
    expect(result.ticketId).toBe('ticket-77')
  })

  it('sets platform to jitbit-helpdesk', () => {
    const raw: RawJitbitComment = { CommentID: 8, UserID: 1, Body: 'y' }
    const result = transformMessage(raw, '1')
    expect(result.platform).toBe('jitbit-helpdesk')
  })

  it('MessageSchema validates authorType system for IsSystem=true', () => {
    const raw: RawJitbitComment = { CommentID: 9, IsSystem: true, Body: 'System message' }
    const result = transformMessage(raw, '1')
    expect(result.authorType).toBe('system')
    expect(() => MessageSchema.parse(result)).not.toThrow()
  })

  it('MessageSchema validates a regular public user message', () => {
    const raw: RawJitbitComment = {
      CommentID: 99,
      UserID: 5,
      ForTechsOnly: false,
      IsSystem: false,
      Body: 'Valid message',
      CommentDate: '2026-01-15T09:30:00.000Z',
    }
    const result = transformMessage(raw, '100')
    expect(() => MessageSchema.parse(result)).not.toThrow()
  })
})
