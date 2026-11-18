import { describe, it, expect } from 'vitest'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema'
import { transformMessage } from '../../../../../../../src/verticals/customer-support/adapters/comm100/transform/message'
import { DOC_MESSAGE } from '../fixtures'

describe('comm100 transformMessage', () => {
  it('maps the documented message example, decoding its base64 body', () => {
    const m = MessageSchema.parse(transformMessage(DOC_MESSAGE, '100'))
    expect(m.id).toBe('3b6560d4-0f10-4652-a376-e590936d290e')
    expect(m.ticketId).toBe('100')
    expect(m.authorId).toBe('31cb8d70-b5a6-4faa-b021-62335d6dcf6c')
    expect(m.authorType).toBe('contact')
    expect(m.body).toBe('<p>111</p>')
    expect(m.type).toBe('public')
    expect(m.attachmentCount).toBe(1)
    expect(m.createdAt).toBe('2021-04-26T10:52:24.336Z')
    expect(m.metadata['channelId']).toBe('Email')
  })

  it('decodes only the documented text/plain base64 prefix, keeping any other data: body verbatim', () => {
    const body = 'data:text/html;base64,PHA+MTExPC9wPg=='
    const m = MessageSchema.parse(transformMessage({ ...DOC_MESSAGE, body }, '100'))
    expect(m.body).toBe(body)
  })

  it('keeps a plaintext body as is', () => {
    const m = MessageSchema.parse(transformMessage({ ...DOC_MESSAGE, body: 'hello' }, '100'))
    expect(m.body).toBe('hello')
  })

  it.each([
    ['contact', 'contact'],
    ['visitor', 'contact'],
    ['agent', 'user'],
    ['chatbot', 'system'],
    ['system', 'system'],
    ['channelAccount', 'unknown'],
  ])('maps sentByType %s to authorType %s', (sentByType, expected) => {
    const m = MessageSchema.parse(transformMessage({ ...DOC_MESSAGE, sentByType }, '100'))
    expect(m.authorType).toBe(expected)
  })

  it('throws instead of inventing a sender or a time', () => {
    const { sentById: _s, ...noSender } = DOC_MESSAGE
    expect(() => transformMessage(noSender, '100')).toThrow(/sentById/)
    const { time: _t, ...noTime } = DOC_MESSAGE
    expect(() => transformMessage(noTime, '100')).toThrow(/time/)
  })
})
