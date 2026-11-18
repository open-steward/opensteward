import { describe, it, expect } from 'vitest'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'
import { transformMessage } from '../../../../../../../src/verticals/customer-support/adapters/sprinklr-service/transform/message'
import { DOC_MESSAGE } from '../fixtures'

describe('transformMessage (Sprinklr POST /api/v2/message/bulk-fetch)', () => {
  it('maps the documented example message and parses as a canonical Message', () => {
    const out = MessageSchema.parse(transformMessage(DOC_MESSAGE, 'case-1'))
    expect(out.id).toBe(
      'VOICE_66076376_1731588218296_SPRINKLR_VOICE_325_000001932ab35db8e4b042fc69f4425d',
    )
    expect(out.externalId).toBe(out.id)
    expect(out.ticketId).toBe('case-1')
    expect(out.authorId).toBe('+12025391107')
    expect(out.authorType).toBe('contact')
    expect(out.type).toBe('public')
    // The documented voice message carries no content.text.
    expect(out.body).toBe('')
    expect(out.attachmentCount).toBeUndefined()
    expect(out.createdAt).toBe(new Date(1731588218337).toISOString())
    expect(out.metadata).toMatchObject({ channelType: 'SPRINKLR_VOICE', brandPost: 'false' })
  })

  it('reads the body from the documented content.text', () => {
    const out = transformMessage({ ...DOC_MESSAGE, content: { text: 'Hello there' } }, 'c')
    expect(MessageSchema.parse(out).body).toBe('Hello there')
  })

  it('maps brandPost and autoResponse to the author type', () => {
    const author = (m: Partial<typeof DOC_MESSAGE>) =>
      MessageSchema.parse(transformMessage({ ...DOC_MESSAGE, ...m }, 'c')).authorType
    expect(author({ brandPost: true, autoResponse: false })).toBe('user')
    expect(author({ brandPost: true, autoResponse: true })).toBe('system')
    expect(author({ brandPost: false })).toBe('contact')
    expect(author({ brandPost: undefined, autoResponse: undefined })).toBe('unknown')
  })

  it('throws instead of inventing an id, author or creation time', () => {
    expect(() => transformMessage({ ...DOC_MESSAGE, messageId: undefined }, 'c')).toThrow(
      /messageId/,
    )
    expect(() => transformMessage({ ...DOC_MESSAGE, senderProfile: null }, 'c')).toThrow(
      /senderProfile/,
    )
    expect(() => transformMessage({ ...DOC_MESSAGE, createdTime: undefined }, 'c')).toThrow(
      /createdTime/,
    )
  })
})
