import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawDocument360Article,
} from '../../../../../../../src/verticals/customer-support/adapters/document360/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'

describe('document360 transformTicket', () => {
  const raw: RawDocument360Article = {
    id: 'art-55',
    title: 'How to reset your password',
    status: 3, // Published → resolved
    slug: 'how-to-reset-password',
    url: 'https://docs.example.com/articles/how-to-reset-password',
    created_by: 'team-member-7',
    lang_code: 'en',
    category_id: 'cat-2',
    content_type: 'markdown',
    created_at: '2024-02-01T09:00:00.000Z',
    modified_at: '2024-03-10T15:30:00.000Z',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformTicket(raw)
    expect(result.id).toBe('art-55')
    expect(result.externalId).toBe('art-55')
  })

  it('maps slug to number field', () => {
    const result = transformTicket(raw)
    expect(result.number).toBe('how-to-reset-password')
  })

  it('maps title to subject', () => {
    const result = transformTicket(raw)
    expect(result.subject).toBe('How to reset your password')
  })

  it('maps status 3 (Published) to resolved', () => {
    const result = transformTicket(raw)
    expect(result.status).toBe('resolved')
  })

  it('maps status 0 (Draft) to open', () => {
    const draft: RawDocument360Article = { ...raw, status: 0 }
    const result = transformTicket(draft)
    expect(result.status).toBe('open')
  })

  it('maps unknown status to pending', () => {
    const inReview: RawDocument360Article = { ...raw, status: 1 }
    const result = transformTicket(inReview)
    expect(result.status).toBe('pending')
  })

  it('maps category_id to teamId', () => {
    const result = transformTicket(raw)
    expect(result.teamId).toBe('cat-2')
  })

  it('maps created_by to requesterId', () => {
    const result = transformTicket(raw)
    expect(result.requesterId).toBe('team-member-7')
  })

  it('sets channel to web', () => {
    const result = transformTicket(raw)
    expect(result.channel).toBe('web')
  })

  it('sets resolvedAt when status is resolved', () => {
    const result = transformTicket(raw)
    expect(result.resolvedAt).toBe('2024-03-10T15:30:00.000Z')
  })

  it('does not set resolvedAt when status is not resolved', () => {
    const draft: RawDocument360Article = { ...raw, status: 0 }
    const result = transformTicket(draft)
    expect(result.resolvedAt).toBeUndefined()
  })

  it('produces a TicketSchema-valid result', () => {
    const result = transformTicket(raw)
    expect(() => TicketSchema.parse(result)).not.toThrow()
  })

  it('handles minimal input — falls back safely', () => {
    const minimal: RawDocument360Article = { id: 'art-min' }
    const result = transformTicket(minimal)
    expect(result.id).toBe('art-min')
    expect(result.subject).toBe('')
    expect(() => TicketSchema.parse(result)).not.toThrow()
  })
})
