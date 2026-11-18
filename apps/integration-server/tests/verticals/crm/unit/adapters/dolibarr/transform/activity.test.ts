import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawDolibarrAction,
} from '../../../../../../../src/verticals/crm/adapters/dolibarr/transform/activity'

/**
 * Fixture: an agenda event as GET /agendaevents/{id} serialises an ActionComm
 * after AgendaEvents::_cleanObjectDatas(). Property names are the ones
 * documented in htdocs/comm/action/class/actioncomm.class.php; dates are the
 * Unix timestamps ActionComm::fetch() stores via $this->db->jdate().
 */
function makeRaw(overrides: Partial<RawDolibarrAction> = {}): RawDolibarrAction {
  return {
    id: 42,
    ref: '42',
    type_id: '5',
    type_code: 'AC_RDV',
    type: 'systemauto',
    type_label: 'Meeting',
    code: 'COMPANY_CREATE',
    label: 'Kick-off meeting',
    datep: 1767261600,
    datef: 1767265200,
    datec: 1767175200,
    datem: 1767178800,
    note_private: 'Bring the Q1 plan',
    percentage: '100',
    authorid: '1',
    usermodid: '1',
    userownerid: '3',
    socid: '17',
    fk_project: null,
    ...overrides,
  }
}

describe('dolibarr transformActivity', () => {
  it('maps the documented ActionComm fields and satisfies the schema', () => {
    const out = ActivitySchema.parse(transformActivity(makeRaw()))
    expect(out).toMatchObject({
      id: '42',
      type: 'AC_RDV',
      subject: 'Kick-off meeting',
      note: 'Bring the Q1 plan',
      company_id: '17',
      owner_id: '3',
      due_date: '2026-01-01T10:00:00.000Z',
      created_at: '2025-12-31T10:00:00.000Z',
      updated_at: '2025-12-31T11:00:00.000Z',
      done: true,
    })
  })

  it('reads done from percentage per LibStatut: -1 n/a, 0..99 open, 100 done', () => {
    expect(transformActivity(makeRaw({ percentage: -1 })).done).toBeUndefined()
    expect(transformActivity(makeRaw({ percentage: '0' })).done).toBe(false)
    expect(transformActivity(makeRaw({ percentage: 50 })).done).toBe(false)
    expect(transformActivity(makeRaw({ percentage: 100 })).done).toBe(true)
  })

  it('leaves jdate() empty strings and unlinked ids unset', () => {
    const out = ActivitySchema.parse(
      transformActivity(makeRaw({ datep: '', datem: '', socid: null, userownerid: null })),
    )
    expect(out.due_date).toBeUndefined()
    expect(out.updated_at).toBeUndefined()
    expect(out.company_id).toBeUndefined()
    expect(out.owner_id).toBeUndefined()
  })

  it('does not read the stripped note / contact_id fields', () => {
    const out = transformActivity(
      makeRaw({ note_private: undefined, note: 'stale', contact_id: 9 }),
    )
    expect(out.note).toBeUndefined()
    expect(out.contact_id).toBeUndefined()
  })

  it('throws on a record with no id rather than inventing one', () => {
    expect(() => transformActivity(makeRaw({ id: undefined }))).toThrow(/no id/)
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransformActivity maps subject to label', () => {
    expect(untransformActivity({ subject: 'Demo' }).label).toBe('Demo')
  })
})
