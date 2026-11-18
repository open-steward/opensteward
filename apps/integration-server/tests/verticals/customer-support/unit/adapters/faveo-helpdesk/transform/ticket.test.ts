import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawFaveoTicket,
} from '../../../../../../../src/verticals/customer-support/adapters/faveo-helpdesk/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'

describe('faveo-helpdesk transformTicket', () => {
  const raw: RawFaveoTicket = {
    id: 1001,
    ticket_number: 'TKT-1001',
    title: 'Cannot login after password reset',
    status: 1, // open
    priority: { name: 'High' },
    source: 2, // email
    user_id: 55,
    assigned_to: 12,
    team_id: 7,
    dept_id: 3,
    rating: 5,
    created_at: '2024-03-01 08:00:00',
    updated_at: '2024-03-05 14:00:00',
    closed_at: null,
    duedate: '2024-03-07 00:00:00',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformTicket(raw)
    expect(result.id).toBe('1001')
    expect(result.externalId).toBe('1001')
  })

  it('maps ticket_number to number field', () => {
    const result = transformTicket(raw)
    expect(result.number).toBe('TKT-1001')
  })

  it('maps title to subject', () => {
    const result = transformTicket(raw)
    expect(result.subject).toBe('Cannot login after password reset')
  })

  it('maps status 1 to open', () => {
    const result = transformTicket(raw)
    expect(result.status).toBe('open')
  })

  it('maps status 2 to pending', () => {
    const answered: RawFaveoTicket = { ...raw, status: 2 }
    const result = transformTicket(answered)
    expect(result.status).toBe('pending')
  })

  it('maps status 3 to resolved', () => {
    const resolved: RawFaveoTicket = { ...raw, status: 3, closed_at: '2024-03-06 10:00:00' }
    const result = transformTicket(resolved)
    expect(result.status).toBe('resolved')
  })

  it('maps status 4 to closed', () => {
    const closed: RawFaveoTicket = { ...raw, status: 4, closed_at: '2024-03-06 10:00:00' }
    const result = transformTicket(closed)
    expect(result.status).toBe('closed')
  })

  it('maps priority object name=High to high', () => {
    const result = transformTicket(raw)
    expect(result.priority).toBe('high')
  })

  it('maps priority string "normal" to normal', () => {
    const normalPriority: RawFaveoTicket = { ...raw, priority: 'normal' }
    const result = transformTicket(normalPriority)
    expect(result.priority).toBe('normal')
  })

  it('maps source 2 to email channel', () => {
    const result = transformTicket(raw)
    expect(result.channel).toBe('email')
  })

  it('maps source 1 to web channel', () => {
    const webTicket: RawFaveoTicket = { ...raw, source: 1 }
    const result = transformTicket(webTicket)
    expect(result.channel).toBe('web')
  })

  it('maps user_id to requesterId', () => {
    const result = transformTicket(raw)
    expect(result.requesterId).toBe('55')
  })

  it('maps assigned_to to assigneeId', () => {
    const result = transformTicket(raw)
    expect(result.assigneeId).toBe('12')
  })

  it('prefers team_id over dept_id for teamId', () => {
    const result = transformTicket(raw)
    expect(result.teamId).toBe('7')
  })

  it('falls back to dept_id when team_id is absent', () => {
    const noDept: RawFaveoTicket = { ...raw, team_id: null }
    const result = transformTicket(noDept)
    expect(result.teamId).toBe('3')
  })

  it('maps positive rating to satisfactionRating=5', () => {
    const result = transformTicket(raw)
    expect(result.satisfactionRating).toBe(5)
  })

  it('sets resolvedAt when status is resolved', () => {
    const resolved: RawFaveoTicket = {
      ...raw,
      status: 3,
      closed_at: '2024-03-06 10:00:00',
      updated_at: '2024-03-06 10:00:00',
    }
    const result = transformTicket(resolved)
    expect(result.resolvedAt).toBeDefined()
  })

  it('produces a TicketSchema-valid result', () => {
    const result = transformTicket(raw)
    expect(() => TicketSchema.parse(result)).not.toThrow()
  })

  it('handles minimal input', () => {
    const minimal: RawFaveoTicket = { id: 1 }
    const result = transformTicket(minimal)
    expect(result.id).toBe('1')
    expect(result.status).toBe('open')
    expect(() => TicketSchema.parse(result)).not.toThrow()
  })
})
