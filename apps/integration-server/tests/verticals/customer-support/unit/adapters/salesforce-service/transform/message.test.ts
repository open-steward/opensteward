import { describe, it, expect } from 'vitest'
import {
  transformCaseComment,
  transformEmailMessage,
} from '../../../../../../../src/verticals/customer-support/adapters/salesforce-service/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'
import { CASE_COMMENT, EMAIL_MESSAGE } from '../fixtures'

describe('transformCaseComment', () => {
  it('maps an unpublished comment as an internal note by its creating user', () => {
    const m = MessageSchema.parse(transformCaseComment(CASE_COMMENT))
    expect(m).toEqual({
      id: '00aD000000abcdeIAA',
      externalId: '00aD000000abcdeIAA',
      ticketId: '500D000000IRFmaIAH',
      authorId: '005D0000005Bk90IAC',
      authorType: 'user',
      body: 'Reset the password and asked the customer to retry.',
      type: 'internal',
      createdAt: '2026-01-15T10:00:00.000Z',
      platform: 'salesforce-service',
      metadata: { sobject: 'CaseComment' },
      raw: CASE_COMMENT,
    })
  })

  it('a published comment is public', () => {
    const m = MessageSchema.parse(transformCaseComment({ ...CASE_COMMENT, IsPublished: true }))
    expect(m.type).toBe('public')
  })
})

describe('transformEmailMessage', () => {
  it('maps an incoming email as a public message from the contact', () => {
    const m = MessageSchema.parse(transformEmailMessage(EMAIL_MESSAGE))
    expect(m).toEqual({
      id: '02sD000000abcdeIAA',
      externalId: '02sD000000abcdeIAA',
      ticketId: '500D000000IRFmaIAH',
      authorId: '003D000000QOVoIIAX',
      authorType: 'contact',
      body: 'I still cannot log in.',
      type: 'public',
      createdAt: '2026-01-15T11:00:00.000Z',
      platform: 'salesforce-service',
      metadata: {
        sobject: 'EmailMessage',
        subject: 'Re: Unable to log in',
        fromAddress: 'jane.doe@acme.example',
        status: '0',
        hasAttachment: 'true',
      },
      raw: EMAIL_MESSAGE,
    })
    expect(m.attachmentCount).toBeUndefined()
  })

  it('an outgoing email with no FromId is from the user who created it, never an address', () => {
    const m = MessageSchema.parse(
      transformEmailMessage({
        ...EMAIL_MESSAGE,
        Incoming: false,
        FromId: null,
        CreatedById: '005D0000005Bk90IAC',
      }),
    )
    expect(m.authorType).toBe('user')
    expect(m.authorId).toBe('005D0000005Bk90IAC')
    expect(m.metadata['fromAddress']).toBe('jane.doe@acme.example')
  })

  it('an incoming email with no FromId has an empty authorId, not the address', () => {
    const m = MessageSchema.parse(transformEmailMessage({ ...EMAIL_MESSAGE, FromId: null }))
    expect(m.authorType).toBe('contact')
    expect(m.authorId).toBe('')
  })

  it('falls back to CreatedDate when MessageDate is null', () => {
    const m = MessageSchema.parse(transformEmailMessage({ ...EMAIL_MESSAGE, MessageDate: null }))
    expect(m.createdAt).toBe('2026-01-15T11:00:05.000Z')
  })
})
