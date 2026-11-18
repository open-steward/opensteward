/**
 * Fixture: the `comments` entry of the POST /uapi/ticket sample response,
 * https://api.usedocs.com/article/51377, plus `type` with the values
 * POST /uapi/create/comment documents ("Comment type public; private.",
 * https://api.usedocs.com/article/51381) and `files` ("Array of attached
 * files name — file name; type — file type; file — download link").
 */
import { describe, expect, it } from 'vitest'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'
import { transformMessage } from '../../../../../../../src/verticals/customer-support/adapters/usedesk/transform/message'

const documented = {
  id: '2658287',
  message: 'additional fields',
  from: 'client',
  user_id: null,
  client_id: '261702',
  ticket_id: '2265179',
  is_first: '0',
  delivered: '0',
  readed: '0',
  published_at: '2017-03-01 14:30:49',
}

describe('usedesk transformMessage (documented comment)', () => {
  it('parses against MessageSchema', () => {
    const out = MessageSchema.parse(transformMessage(documented, '2265179'))
    expect(out).toMatchObject({
      id: '2658287',
      externalId: '2658287',
      ticketId: '2265179',
      authorId: '261702',
      authorType: 'contact',
      body: 'additional fields',
      createdAt: '2017-03-01T14:30:49.000Z',
      platform: 'usedesk',
    })
  })

  it('reads published_at as UTC+0 whatever the host zone', () => {
    const tz = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      expect(transformMessage(documented, 't').createdAt).toBe('2017-03-01T14:30:49.000Z')
    } finally {
      process.env.TZ = tz
    }
  })

  it('an agent comment (from=user) is authored by user_id', () => {
    const out = MessageSchema.parse(
      transformMessage({ ...documented, from: 'user', user_id: '558', client_id: null }, 't'),
    )
    expect(out.authorType).toBe('user')
    expect(out.authorId).toBe('558')
  })

  it('maps the documented comment types', () => {
    expect(transformMessage({ ...documented, type: 'public' }, 't').type).toBe('public')
    expect(transformMessage({ ...documented, type: 'private' }, 't').type).toBe('internal')
    expect(MessageSchema.parse(transformMessage(documented, 't')).type).toBe('unknown')
  })

  it('an undocumented from value is unknown, not a contact', () => {
    const out = MessageSchema.parse(transformMessage({ ...documented, from: 'system' }, 't'))
    expect(out.authorType).toBe('unknown')
    expect(out.authorId).toBe('')
  })

  it('counts files', () => {
    const files = [{ name: 'a.png', type: 'image/png', file: 'https://x/a.png' }]
    expect(transformMessage({ ...documented, files }, 't').attachmentCount).toBe(1)
    expect(transformMessage(documented, 't').attachmentCount).toBeUndefined()
  })

  it('throws rather than invent a creation date', () => {
    expect(() => transformMessage({ ...documented, published_at: null }, 't')).toThrow(
      /published_at/,
    )
  })
})
