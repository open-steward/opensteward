import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  type RawZnunyArticle,
} from '../../../../../../../src/verticals/customer-support/adapters/znuny/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'

describe('transformMessage', () => {
  it('maps a public customer article to a Message with platform=znuny', () => {
    const raw: RawZnunyArticle = {
      ArticleID: '5001',
      Subject: 'Password reset',
      Body: 'I cannot reset my password.',
      From: 'user@example.com',
      To: 'support@company.com',
      CommunicationChannel: 'email-external',
      IsVisibleForCustomer: 1,
      SenderType: 'customer',
      ContentType: 'text/plain; charset=utf-8',
      Created: '2026-01-15 09:00:00',
      CreateBy: '0',
      Attachment: [],
    }
    const msg = transformMessage(raw, 'tkt-1001')

    expect(msg.id).toBe('5001')
    expect(msg.externalId).toBe('5001')
    expect(msg.ticketId).toBe('tkt-1001')
    expect(msg.platform).toBe('znuny')
    expect(msg.authorType).toBe('contact')
    expect(msg.body).toBe('I cannot reset my password.')
    expect(msg.type).toBe('public')
    expect(msg.attachmentCount).toBe(0)
    expect(msg.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(msg.metadata['subject']).toBe('Password reset')
    expect(msg.metadata['from']).toBe('user@example.com')
    expect(msg.metadata['communicationChannel']).toBe('email-external')
    expect(msg.metadata['senderType']).toBe('customer')
  })

  it('maps IsVisibleForCustomer=0 to type=internal', () => {
    const raw: RawZnunyArticle = {
      ArticleID: '5002',
      IsVisibleForCustomer: 0,
      SenderType: 'agent',
      Body: 'Internal note about this customer.',
      Created: '2026-01-15 09:01:00',
      CreateBy: '42',
    }
    const msg = transformMessage(raw, 'tkt-1001')
    expect(msg.type).toBe('internal')
    expect(msg.authorType).toBe('user')
  })

  it('maps SenderType=agent to authorType=user', () => {
    const raw: RawZnunyArticle = {
      ArticleID: '5003',
      SenderType: 'agent',
      IsVisibleForCustomer: 1,
      Created: '2026-01-15 09:02:00',
      CreateBy: '10',
    }
    const msg = transformMessage(raw, 'tkt-1001')
    expect(msg.authorType).toBe('user')
    expect(msg.authorId).toBe('10')
  })

  it('maps SenderType=system to authorType=system', () => {
    const raw: RawZnunyArticle = {
      ArticleID: '5004',
      SenderType: 'system',
      IsVisibleForCustomer: 1,
      Created: '2026-01-15 09:03:00',
      CreateBy: '0',
    }
    const msg = transformMessage(raw, 'tkt-1001')
    expect(msg.authorType).toBe('system')
  })

  it('counts attachments correctly', () => {
    const raw: RawZnunyArticle = {
      ArticleID: '5005',
      SenderType: 'customer',
      IsVisibleForCustomer: 1,
      Created: '2026-01-15 09:04:00',
      CreateBy: '0',
      Attachment: [{ Filename: 'doc.pdf' }, { Filename: 'image.png' }],
    }
    const msg = transformMessage(raw, 'tkt-1001')
    expect(msg.attachmentCount).toBe(2)
  })

  it('handles IsVisibleForCustomer as string "0" (internal)', () => {
    const raw: RawZnunyArticle = {
      ArticleID: '5006',
      IsVisibleForCustomer: '0' as unknown as number,
      SenderType: 'agent',
      Created: '2026-01-15 09:05:00',
      CreateBy: '5',
    }
    const msg = transformMessage(raw, 'tkt-1001')
    expect(msg.type).toBe('internal')
  })

  it('falls back to epoch ISO when Created is absent', () => {
    const raw: RawZnunyArticle = {
      ArticleID: '5007',
      CreateBy: '0',
    }
    const msg = transformMessage(raw, 'tkt-1001')
    expect(msg.createdAt).toBe(new Date(0).toISOString())
  })

  it('passes MessageSchema.parse without throwing', () => {
    const raw: RawZnunyArticle = {
      ArticleID: '9000',
      Subject: 'Parse check',
      Body: 'Testing schema parse',
      SenderType: 'customer',
      IsVisibleForCustomer: 1,
      CommunicationChannel: 'email-external',
      Created: '2026-01-15 09:00:00',
      CreateBy: '0',
    }
    const msg = transformMessage(raw, 'tkt-parse')
    expect(() => MessageSchema.parse(msg)).not.toThrow()
  })
})
