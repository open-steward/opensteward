/**
 * Fixture: the documented ticket-threads response
 * (https://developers.faveohelpdesk.com/ticket-threads-2/).
 */
import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  type RawFaveoThread,
} from '../../../../../../../src/verticals/customer-support/adapters/faveo-helpdesk/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'

const documented: RawFaveoThread[] = [
  {
    id: 2249,
    user_id: null,
    title: 'Non corrupti adipisci ea.',
    body: 'Similique debitis quidem molestiae libero. quia. Veniam animi nihil voluptatibus.',
    created_at: '2018-03-20 05:17:24',
    attach: [
      { id: 2249, name: 'file.png', file: 'base64_image', type: 'image/png' },
      { id: 2250, name: 'file2.png', file: 'base64_image', type: 'image/png' },
    ],
  },
  {
    id: 2250,
    user_id: null,
    title: 'Voluptas vel harum ratione accusamus.',
    body: 'Dolorum ut tenetur cum sint nihil libero porro quia incidunt.',
    created_at: '2018-03-20 05:17:24',
    attach: [],
  },
]

describe('faveo-helpdesk transformMessage', () => {
  it('parses every documented thread with the canonical schema', () => {
    for (const raw of documented) MessageSchema.parse(transformMessage(raw, '10394'))
  })

  it('maps the documented fields', () => {
    const m = MessageSchema.parse(transformMessage(documented[0]!, '10394'))
    expect(m.id).toBe('2249')
    expect(m.externalId).toBe('2249')
    expect(m.ticketId).toBe('10394')
    expect(m.body).toBe(documented[0]!.body)
    expect(m.metadata).toEqual({ title: 'Non corrupti adipisci ea.' })
    expect(m.platform).toBe('faveo-helpdesk')
  })

  it('reads the offset-less created_at as UTC, whatever the host zone', () => {
    // vitest pins TZ=UTC, which hides a local-zone parse; move the host zone.
    const saved = process.env['TZ']
    process.env['TZ'] = 'Asia/Kolkata'
    try {
      expect(transformMessage(documented[0]!, '1').createdAt).toBe('2018-03-20T05:17:24.000Z')
    } finally {
      process.env['TZ'] = saved
    }
  })

  it('throws on a created_at it cannot read rather than inventing a time', () => {
    expect(() => transformMessage({ ...documented[0]!, created_at: 'yesterday' }, '1')).toThrow(
      /created_at/,
    )
  })

  it('counts attachments and keeps their content out of raw', () => {
    const m = transformMessage(documented[0]!, '1')
    expect(m.attachmentCount).toBe(2)
    expect(JSON.stringify(m.raw)).not.toContain('base64_image')
    expect(transformMessage(documented[1]!, '1').attachmentCount).toBe(0)
  })

  it('leaves author role and visibility unknown: the thread documents neither', () => {
    const m = transformMessage(documented[0]!, '1')
    expect(m.authorType).toBe('unknown')
    expect(m.type).toBe('unknown')
  })

  it('a documented null user_id has no author id; a set one is kept', () => {
    expect(transformMessage(documented[0]!, '1').authorId).toBe('')
    expect(transformMessage({ ...documented[0]!, user_id: 12 }, '1').authorId).toBe('12')
  })
})
