import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawVitallyConversation,
} from '../../../../../../../src/verticals/crm/adapters/vitally/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawVitallyConversation> = {}): RawVitallyConversation {
  return {
    id: 'conv_001',
    subject: 'Acme Q1 Expansion',
    status: 'open',
    accounts: [{ id: 'acc_001', name: 'Acme Industries' }],
    createdAt: '2026-01-15T09:30:00.000Z',
    updatedAt: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('vitally transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw()).id).toBe('conv_001')
  })

  it('maps subject to title', () => {
    expect(transformDeal(makeRaw()).title).toBe('Acme Q1 Expansion')
  })

  it('uses (no subject) fallback when subject is null', () => {
    expect(transformDeal(makeRaw({ subject: null })).title).toBe('(no subject)')
  })

  it('uses (no subject) fallback when subject is empty string', () => {
    expect(transformDeal(makeRaw({ subject: '' })).title).toBe('(no subject)')
  })

  it('maps status', () => {
    expect(transformDeal(makeRaw()).status).toBe('open')
  })

  it('maps first accounts[0].id to company_id', () => {
    expect(transformDeal(makeRaw()).company_id).toBe('acc_001')
  })

  it('company_id is undefined when accounts is empty', () => {
    expect(transformDeal(makeRaw({ accounts: [] })).company_id).toBeUndefined()
  })

  it('maps createdAt to created_at', () => {
    expect(transformDeal(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('maps updatedAt to updated_at', () => {
    expect(transformDeal(makeRaw()).updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('preserves raw as metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => DealSchema.parse(transformDeal(makeRaw()))).not.toThrow()
  })

  it('handles minimal input without throwing', () => {
    const minimal: RawVitallyConversation = { id: 'conv_min' }
    expect(() => DealSchema.parse(transformDeal(minimal))).not.toThrow()
  })
})

describe('vitally untransformDeal', () => {
  it('maps title to subject', () => {
    const out = untransformDeal({ title: 'My Deal' })
    expect(out.subject).toBe('My Deal')
  })

  it('does not include extra fields when title not specified', () => {
    const out = untransformDeal({})
    expect(Object.keys(out)).toHaveLength(0)
  })
})
