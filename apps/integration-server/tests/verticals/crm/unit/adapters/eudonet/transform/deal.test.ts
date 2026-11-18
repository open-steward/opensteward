import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
} from '../../../../../../../src/verticals/crm/adapters/eudonet/transform/deal'
import type { EudonetRow } from '../../../../../../../src/verticals/crm/adapters/eudonet/client'
import {
  FIELD_DEAL_TITLE,
  FIELD_DEAL_STATUS,
  FIELD_DEAL_STAGE,
  FIELD_DEAL_AMOUNT,
  FIELD_DEAL_CURRENCY,
  FIELD_DEAL_COMPANY_ID,
  FIELD_DEAL_CLOSE_DATE,
  FIELD_DEAL_CREATED_AT,
  FIELD_DEAL_UPDATED_AT,
} from '../../../../../../../src/verticals/crm/adapters/eudonet/constants'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRow(fields: Record<number, unknown> = {}, fileId = 42): EudonetRow {
  return {
    FileId: fileId,
    Fields: Object.entries(fields).map(([k, v]) => ({ DescId: Number(k), Value: v })),
  }
}

describe('eudonet transformDeal', () => {
  it('maps FileId to string id', () => {
    expect(transformDeal(makeRow({}, 33)).id).toBe('33')
  })

  it('extracts title from field 301', () => {
    const row = makeRow({ [FIELD_DEAL_TITLE]: 'Q1 Expansion' })
    expect(transformDeal(row).title).toBe('Q1 Expansion')
  })

  it('falls back to empty string when title absent', () => {
    expect(transformDeal(makeRow()).title).toBe('')
  })

  it('extracts status from field 302', () => {
    const row = makeRow({ [FIELD_DEAL_STATUS]: 'open' })
    expect(transformDeal(row).status).toBe('open')
  })

  it('extracts stage from field 303', () => {
    const row = makeRow({ [FIELD_DEAL_STAGE]: 'Negotiation' })
    expect(transformDeal(row).stage).toBe('Negotiation')
  })

  it('builds value object when amount present', () => {
    const row = makeRow({ [FIELD_DEAL_AMOUNT]: '5000', [FIELD_DEAL_CURRENCY]: 'USD' })
    const result = transformDeal(row)
    expect(result.value).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('defaults currency to EUR when currency field absent', () => {
    const row = makeRow({ [FIELD_DEAL_AMOUNT]: '5000' })
    expect(transformDeal(row).value?.currency).toBe('EUR')
  })

  it('omits value when amount absent', () => {
    expect(transformDeal(makeRow()).value).toBeUndefined()
  })

  it('extracts company_id from field 306', () => {
    const row = makeRow({ [FIELD_DEAL_COMPANY_ID]: '100' })
    expect(transformDeal(row).company_id).toBe('100')
  })

  it('converts ISO close date from field 307', () => {
    const row = makeRow({ [FIELD_DEAL_CLOSE_DATE]: '2024-03-31T00:00:00Z' })
    expect(transformDeal(row).close_date).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('converts ISO timestamps from fields 390/391', () => {
    const row = makeRow({
      [FIELD_DEAL_CREATED_AT]: '2023-11-01T10:00:00Z',
      [FIELD_DEAL_UPDATED_AT]: '2023-11-14T22:00:00Z',
    })
    const result = transformDeal(row)
    expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(result.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRow())).not.toThrow()
  })

  it('preserves raw row as metadata by reference', () => {
    const row = makeRow()
    expect(transformDeal(row).metadata).toBe(row)
  })

  it('passes DealSchema validation with full input', () => {
    const row = makeRow({
      [FIELD_DEAL_TITLE]: 'Q1 Expansion',
      [FIELD_DEAL_STATUS]: 'open',
      [FIELD_DEAL_STAGE]: 'Negotiation',
      [FIELD_DEAL_AMOUNT]: '5000',
      [FIELD_DEAL_CURRENCY]: 'USD',
      [FIELD_DEAL_COMPANY_ID]: '100',
      [FIELD_DEAL_CLOSE_DATE]: '2024-03-31T00:00:00Z',
      [FIELD_DEAL_CREATED_AT]: '2023-11-01T10:00:00Z',
      [FIELD_DEAL_UPDATED_AT]: '2023-11-14T22:00:00Z',
    })
    const result = transformDeal(row)
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('eudonet untransformDeal', () => {
  it('emits title field with correct DescId', () => {
    const fields = untransformDeal({ title: 'Q1 Expansion' })
    const f = fields.find((x) => x.DescId === FIELD_DEAL_TITLE)
    expect(f?.Value).toBe('Q1 Expansion')
  })

  it('emits amount field with correct DescId', () => {
    const fields = untransformDeal({ value: { amount: 5000, currency: 'USD' } })
    const f = fields.find((x) => x.DescId === FIELD_DEAL_AMOUNT)
    expect(f?.Value).toBe(5000)
  })

  it('emits currency field separately', () => {
    const fields = untransformDeal({ value: { amount: 5000, currency: 'USD' } })
    const f = fields.find((x) => x.DescId === FIELD_DEAL_CURRENCY)
    expect(f?.Value).toBe('USD')
  })

  it('emits close_date field with correct DescId', () => {
    const fields = untransformDeal({ close_date: '2024-03-31T00:00:00.000Z' })
    const f = fields.find((x) => x.DescId === FIELD_DEAL_CLOSE_DATE)
    expect(f?.Value).toBe('2024-03-31T00:00:00.000Z')
  })

  it('omits fields not provided', () => {
    const fields = untransformDeal({ title: 'Deal' })
    expect(fields.find((x) => x.DescId === FIELD_DEAL_STATUS)).toBeUndefined()
  })

  it('returns empty array when no data provided', () => {
    expect(untransformDeal({})).toEqual([])
  })
})
