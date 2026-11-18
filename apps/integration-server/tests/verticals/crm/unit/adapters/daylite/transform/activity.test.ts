import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawDayliteTask,
} from '../../../../../../../src/verticals/crm/adapters/daylite/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawDayliteTask> = {}): RawDayliteTask {
  return { self: '/v1/tasks/1', ...overrides }
}

describe('daylite transformActivity', () => {
  it('extracts id from self URL', () => {
    expect(transformActivity(makeRaw({ self: '/v1/tasks/99' })).id).toBe('99')
  })

  it('hardcodes type as "task"', () => {
    expect(transformActivity(makeRaw()).type).toBe('task')
  })

  it('maps title to subject', () => {
    const result = transformActivity(makeRaw({ title: 'Follow up' }))
    expect(result.subject).toBe('Follow up')
  })

  it('maps details to note', () => {
    const result = transformActivity(makeRaw({ details: 'Discuss Q1 goals' }))
    expect(result.note).toBe('Discuss Q1 goals')
  })

  it('sets done=true when status=done', () => {
    const result = transformActivity(makeRaw({ status: 'done' }))
    expect(result.done).toBe(true)
  })

  it('sets done=false when status is not done', () => {
    const result = transformActivity(makeRaw({ status: 'open' }))
    expect(result.done).toBe(false)
  })

  it('sets done=false when status is cancelled', () => {
    const result = transformActivity(makeRaw({ status: 'cancelled' }))
    expect(result.done).toBe(false)
  })

  it('maps due to due_date', () => {
    const result = transformActivity(makeRaw({ due: '2026-03-01T00:00:00.000Z' }))
    expect(result.due_date).toBe('2026-03-01T00:00:00.000Z')
  })

  it('extracts owner_id from owner URL', () => {
    const result = transformActivity(makeRaw({ owner: '/v1/users/7' }))
    expect(result.owner_id).toBe('7')
  })

  it('extracts contact_id from first contacts URL', () => {
    const result = transformActivity(makeRaw({ contacts: ['/v1/contacts/10'] }))
    expect(result.contact_id).toBe('10')
  })

  it('extracts company_id from first companies URL', () => {
    const result = transformActivity(makeRaw({ companies: ['/v1/companies/20'] }))
    expect(result.company_id).toBe('20')
  })

  it('extracts deal_id from first opportunities URL', () => {
    const result = transformActivity(makeRaw({ opportunities: ['/v1/opportunities/30'] }))
    expect(result.deal_id).toBe('30')
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces an ActivitySchema-valid result', () => {
    const raw = makeRaw({
      self: '/v1/tasks/1',
      title: 'Follow up',
      status: 'open',
      due: '2026-03-01T00:00:00.000Z',
      create_date: '2026-01-01T00:00:00.000Z',
    })
    expect(() => ActivitySchema.parse(transformActivity(raw))).not.toThrow()
  })
})

describe('daylite untransformActivity', () => {
  it('maps subject → title', () => {
    const out = untransformActivity({ subject: 'Follow up' })
    expect(out.title).toBe('Follow up')
  })

  it('maps note → details', () => {
    const out = untransformActivity({ note: 'Discuss goals' })
    expect(out.details).toBe('Discuss goals')
  })

  it('maps due_date → due', () => {
    const out = untransformActivity({ due_date: '2026-03-01T00:00:00.000Z' })
    expect(out.due).toBe('2026-03-01T00:00:00.000Z')
  })

  it('maps done=true → status=done', () => {
    const out = untransformActivity({ done: true })
    expect(out.status).toBe('done')
  })

  it('maps done=false → status=open', () => {
    const out = untransformActivity({ done: false })
    expect(out.status).toBe('open')
  })

  it('maps owner_id → owner URL', () => {
    const out = untransformActivity({ owner_id: '7' })
    expect(out.owner).toBe('/v1/users/7')
  })

  it('maps contact_id → contacts URL array', () => {
    const out = untransformActivity({ contact_id: '10' })
    expect(out.contacts).toEqual(['/v1/contacts/10'])
  })

  it('maps company_id → companies URL array', () => {
    const out = untransformActivity({ company_id: '20' })
    expect(out.companies).toEqual(['/v1/companies/20'])
  })

  it('maps deal_id → opportunities URL array', () => {
    const out = untransformActivity({ deal_id: '30' })
    expect(out.opportunities).toEqual(['/v1/opportunities/30'])
  })

  it('round-trips subject and done', () => {
    const raw = makeRaw({ title: 'Discovery call', status: 'done' })
    const activity = transformActivity(raw)
    const back = untransformActivity(activity)
    expect(back.title).toBe('Discovery call')
    expect(back.status).toBe('done')
  })
})
