import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/take-blip/transform/ticket'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/take-blip/transform/team'

// ---------------------------------------------------------------------------
// transformTicket
// ---------------------------------------------------------------------------

describe('TakeBlip transformTicket', () => {
  it('maps id and externalId', () => {
    const out = transformTicket({ id: 'tkt-abc', status: 'Open' })
    expect(out.id).toBe('tkt-abc')
    expect(out.externalId).toBe('tkt-abc')
  })

  it('maps status=Open to open', () => {
    const out = transformTicket({ id: 'tkt-1', status: 'Open' })
    expect(out.status).toBe('open')
  })

  it('maps status=Waiting to pending', () => {
    const out = transformTicket({ id: 'tkt-2', status: 'Waiting' })
    expect(out.status).toBe('pending')
  })

  it('maps status=ClosedAttendant to closed', () => {
    const out = transformTicket({ id: 'tkt-3', status: 'ClosedAttendant' })
    expect(out.status).toBe('closed')
  })

  it('maps status=ClosedClient to closed', () => {
    const out = transformTicket({ id: 'tkt-4', status: 'ClosedClient' })
    expect(out.status).toBe('closed')
  })

  it('maps status=ClosedClientInactivity to closed', () => {
    const out = transformTicket({ id: 'tkt-5', status: 'ClosedClientInactivity' })
    expect(out.status).toBe('closed')
  })

  it('defaults status to open for unknown values', () => {
    const out = transformTicket({ id: 'tkt-6', status: 'SomeUnknown' })
    expect(out.status).toBe('open')
  })

  it('sets channel to chat', () => {
    const out = transformTicket({ id: 'tkt-7' })
    expect(out.channel).toBe('chat')
  })

  it('maps sequentialId as number field', () => {
    const out = transformTicket({ id: 'tkt-8', sequentialId: 42 })
    expect(out.number).toBe('42')
  })

  it('falls back number to id when sequentialId absent', () => {
    const out = transformTicket({ id: 'tkt-9' })
    expect(out.number).toBe('tkt-9')
  })

  it('maps customerIdentity as requesterId', () => {
    const out = transformTicket({ id: 'tkt-10', customerIdentity: 'customer@wa.gw.msging.net' })
    expect(out.requesterId).toBe('customer@wa.gw.msging.net')
  })

  it('maps agentIdentity as assigneeId', () => {
    const out = transformTicket({ id: 'tkt-11', agentIdentity: 'agent@desk.msging.net' })
    expect(out.assigneeId).toBe('agent@desk.msging.net')
  })

  it('maps teamName as teamId', () => {
    const out = transformTicket({ id: 'tkt-12', teamName: 'Support' })
    expect(out.teamId).toBe('Support')
  })

  it('maps tags array', () => {
    const out = transformTicket({ id: 'tkt-13', tags: ['billing', 'urgent'] })
    expect(out.tagIds).toEqual(['billing', 'urgent'])
  })

  it('tagIds is empty array when absent', () => {
    const out = transformTicket({ id: 'tkt-14' })
    expect(out.tagIds).toEqual([])
  })

  it('createdAt is ISO-8601', () => {
    const out = transformTicket({ id: 'tkt-15', storageDate: '2026-03-01T10:00:00Z' })
    expect(out.createdAt).toBe('2026-03-01T10:00:00.000Z')
  })

  it('sets resolvedAt for closed ticket from closeDate', () => {
    const out = transformTicket({
      id: 'tkt-16',
      status: 'ClosedClient',
      closeDate: '2026-04-01T12:00:00Z',
    })
    expect(out.resolvedAt).toBe('2026-04-01T12:00:00.000Z')
  })

  it('platform is always take-blip', () => {
    const out = transformTicket({ id: 'tkt-17' })
    expect(out.platform).toBe('take-blip')
  })

  it('preserves raw', () => {
    const raw = { id: 'tkt-18', status: 'Open' }
    const out = transformTicket(raw)
    expect(out.raw).toBe(raw)
  })

  // satisfactionRating guard: only integer in [1,5]
  it('satisfactionRating: accepts valid integer 1', () => {
    const out = transformTicket({ id: 'tkt-20', rating: 1 })
    expect(out.satisfactionRating).toBe(1)
  })

  it('satisfactionRating: accepts valid integer 5', () => {
    const out = transformTicket({ id: 'tkt-21', rating: 5 })
    expect(out.satisfactionRating).toBe(5)
  })

  it('satisfactionRating: accepts valid integer 3', () => {
    const out = transformTicket({ id: 'tkt-22', rating: 3 })
    expect(out.satisfactionRating).toBe(3)
  })

  it('satisfactionRating: rejects 0 (out of range)', () => {
    const out = transformTicket({ id: 'tkt-23', rating: 0 })
    expect(out.satisfactionRating).toBeUndefined()
  })

  it('satisfactionRating: rejects 6 (out of range)', () => {
    const out = transformTicket({ id: 'tkt-24', rating: 6 })
    expect(out.satisfactionRating).toBeUndefined()
  })

  it('satisfactionRating: rejects float (non-integer)', () => {
    const out = transformTicket({ id: 'tkt-25', rating: 3.5 })
    expect(out.satisfactionRating).toBeUndefined()
  })

  it('satisfactionRating: rejects null', () => {
    const out = transformTicket({ id: 'tkt-26', rating: null })
    expect(out.satisfactionRating).toBeUndefined()
  })

  it('satisfactionRating: undefined when absent', () => {
    const out = transformTicket({ id: 'tkt-27' })
    expect(out.satisfactionRating).toBeUndefined()
  })

  it('does not throw on minimal input', () => {
    expect(() => transformTicket({ id: '' })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformTeam
// ---------------------------------------------------------------------------

describe('TakeBlip transformTeam', () => {
  it('maps id and name', () => {
    const out = transformTeam({ id: 'team-1', name: 'Support Team' })
    expect(out.id).toBe('team-1')
    expect(out.name).toBe('Support Team')
  })

  it('falls back id to name when id absent', () => {
    const out = transformTeam({ name: 'Billing' })
    expect(out.id).toBe('Billing')
  })

  it('maps agentLimit in metadata', () => {
    const out = transformTeam({ id: 'team-2', name: 'T2', agentLimit: 5 })
    expect(out.metadata['agentLimit']).toBe('5')
  })

  it('maps isActive in metadata', () => {
    const out = transformTeam({ id: 'team-3', name: 'T3', isActive: true })
    expect(out.metadata['isActive']).toBe('true')
  })

  it('platform is always take-blip', () => {
    const out = transformTeam({ id: 'team-4', name: 'T4' })
    expect(out.platform).toBe('take-blip')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformTeam({})).not.toThrow()
  })
})
