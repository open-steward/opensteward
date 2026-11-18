import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawMegaplanActivity,
} from '../../../../../../../src/verticals/crm/adapters/megaplan/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawMegaplanActivity> = {}): RawMegaplanActivity {
  return { id: '1', ...overrides }
}

describe('megaplan transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('always sets type to "task"', () => {
    expect(transformActivity(makeRaw()).type).toBe('task')
  })

  it('maps name to subject', () => {
    expect(transformActivity(makeRaw({ name: 'Call client' })).subject).toBe('Call client')
  })

  it('maps statement to note', () => {
    expect(transformActivity(makeRaw({ statement: 'Check renewal' })).note).toBe('Check renewal')
  })

  it('maps responsible.id to owner_id as string', () => {
    expect(
      transformActivity(makeRaw({ responsible: { id: '7', contentType: 'Employee' } })).owner_id,
    ).toBe('7')
  })

  it('maps contractor.id to contact_id as string', () => {
    expect(
      transformActivity(makeRaw({ contractor: { id: '15', contentType: 'Contractor' } }))
        .contact_id,
    ).toBe('15')
  })

  it('maps deal.id to deal_id as string', () => {
    expect(transformActivity(makeRaw({ deal: { id: '3', contentType: 'Deal' } })).deal_id).toBe('3')
  })

  it('sets done = true when status is "done"', () => {
    expect(transformActivity(makeRaw({ status: 'done' })).done).toBe(true)
  })

  it('sets done = false when status is "open"', () => {
    expect(transformActivity(makeRaw({ status: 'open' })).done).toBe(false)
  })

  it('maps deadlineHard to due_date', () => {
    const result = transformActivity(makeRaw({ deadlineHard: '2024-09-01T00:00:00.000Z' }))
    expect(result.due_date).toBe('2024-09-01T00:00:00.000Z')
  })

  it('maps timeCreated to created_at', () => {
    const result = transformActivity(makeRaw({ timeCreated: '2024-01-01T00:00:00.000Z' }))
    expect(result.created_at).toBe('2024-01-01T00:00:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('passes ActivitySchema validation', () => {
    const raw: RawMegaplanActivity = {
      id: '42',
      name: 'Follow up with client',
      statement: 'Discuss renewal terms',
      status: 'open',
      responsible: { id: '7', contentType: 'Employee' },
      contractor: { id: '15', contentType: 'Contractor' },
      deal: { id: '3', contentType: 'Deal' },
      deadlineHard: '2024-09-01T00:00:00.000Z',
      timeCreated: '2024-01-01T00:00:00.000Z',
      timeUpdated: '2024-08-01T00:00:00.000Z',
    }
    const result = transformActivity(raw)
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('megaplan untransformActivity', () => {
  it('maps subject to name', () => {
    expect(untransformActivity({ subject: 'Call client' }).name).toBe('Call client')
  })

  it('maps note to statement', () => {
    expect(untransformActivity({ note: 'Renewal discussion' }).statement).toBe('Renewal discussion')
  })

  it('maps owner_id to responsible object', () => {
    const result = untransformActivity({ owner_id: '7' })
    expect(result.responsible).toEqual({ id: '7' })
  })

  it('maps done=true to status "done"', () => {
    expect(untransformActivity({ done: true }).status).toBe('done')
  })

  it('maps done=false to status "open"', () => {
    expect(untransformActivity({ done: false }).status).toBe('open')
  })

  it('maps deal_id to deal object', () => {
    const result = untransformActivity({ deal_id: '3' })
    expect(result.deal).toEqual({ id: '3' })
  })
})
