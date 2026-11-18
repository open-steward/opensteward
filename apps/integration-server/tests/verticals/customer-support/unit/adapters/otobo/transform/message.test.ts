/**
 * otobo transformMessage.
 *
 * Fixtures follow the documented article fields: TicketGet.pm (rel-11_0) lists
 * ArticleID, From, To, Cc, Subject, Body, ReplyTo, MessageID, InReplyTo,
 * References, SenderType, SenderTypeID, IsVisibleForCustomer, ContentType,
 * Charset, MimeType, IncomingTime, TimeUnit; the example values come from
 * Kernel/System/Ticket/Article/Backend/MIMEBase.pm ArticleGet().
 */
import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  type RawOtoboArticle,
} from '../../../../../../../src/verticals/customer-support/adapters/otobo/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'

function documented(overrides: Partial<RawOtoboArticle> = {}): RawOtoboArticle {
  return {
    ArticleID: 123,
    From: 'Some Agent <email@example.com>',
    To: 'Some Customer A <customer-a@example.com>',
    Cc: 'Some Customer B <customer-b@example.com>',
    ReplyTo: 'Some Customer B <customer-b@example.com>',
    Subject: 'some short description',
    MessageID: '<asdasdasd.123@example.com>',
    InReplyTo: '<asdasdasd.12@example.com>',
    References: '<asdasdasd.1@example.com> <asdasdasd.12@example.com>',
    ContentType: 'text/plain; charset=ISO-8859-15',
    Body: 'the message text',
    SenderTypeID: 1,
    SenderType: 'agent',
    IsVisibleForCustomer: 1,
    IncomingTime: 1490690026,
    Charset: 'ISO-8859-15',
    MimeType: 'text/plain',
    TimeUnit: 0,
    ...overrides,
  }
}

describe('otobo transformMessage', () => {
  it('maps the documented article to a canonical Message', () => {
    const result = MessageSchema.parse(transformMessage(documented(), '32'))

    expect(result.id).toBe('123')
    expect(result.externalId).toBe('123')
    expect(result.ticketId).toBe('32')
    expect(result.authorId).toBe('Some Agent <email@example.com>')
    expect(result.authorType).toBe('user')
    expect(result.body).toBe('the message text')
    expect(result.type).toBe('public')
    expect(result.platform).toBe('otobo')
    expect(result.metadata).toMatchObject({
      subject: 'some short description',
      mimeType: 'text/plain',
      contentType: 'text/plain; charset=ISO-8859-15',
      senderType: 'agent',
    })
  })

  it('takes createdAt from IncomingTime (unix seconds)', () => {
    const result = MessageSchema.parse(transformMessage(documented(), '32'))
    // 1490690026 is the documented example; ArticleGet pairs it with CreateTime 2017-03-28 08:33:47
    expect(result.createdAt).toBe('2017-03-28T08:33:46.000Z')
  })

  it('throws rather than inventing createdAt when IncomingTime is missing', () => {
    expect(() => transformMessage(documented({ IncomingTime: undefined }), '32')).toThrow(
      /IncomingTime/,
    )
  })

  it('throws rather than inventing an id when ArticleID is missing', () => {
    expect(() => transformMessage(documented({ ArticleID: undefined }), '32')).toThrow(/ArticleID/)
    expect(() => transformMessage(documented({ ArticleID: '' }), '32')).toThrow(/ArticleID/)
  })

  it.each([
    [0, 'internal'],
    ['0', 'internal'],
    [1, 'public'],
    ['1', 'public'],
  ] as const)('maps IsVisibleForCustomer %s → %s', (visible, expected) => {
    const result = MessageSchema.parse(
      transformMessage(documented({ IsVisibleForCustomer: visible }), '32'),
    )
    expect(result.type).toBe(expected)
  })

  it.each([
    ['agent', 'user'],
    ['customer', 'contact'],
    ['system', 'system'],
    ['robot', 'unknown'],
  ] as const)('maps SenderType %s → %s', (senderType, expected) => {
    const result = MessageSchema.parse(
      transformMessage(documented({ SenderType: senderType }), '32'),
    )
    expect(result.authorType).toBe(expected)
  })

  it('counts attachments only when the Attachment array is present', () => {
    expect(transformMessage(documented(), '32').attachmentCount).toBeUndefined()
    const withAttachments = MessageSchema.parse(
      transformMessage(
        documented({
          Attachment: [
            {
              ContentType: 'application/pdf',
              FileID: 34,
              Filename: 'StdAttachment-Test1.pdf',
              FilesizeRaw: 4722,
            },
          ],
        }),
        '32',
      ),
    )
    expect(withAttachments.attachmentCount).toBe(1)
  })
})
