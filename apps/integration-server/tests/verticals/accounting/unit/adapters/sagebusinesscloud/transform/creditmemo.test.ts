import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type SageCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/sagebusinesscloud/transform/creditmemo'

function makeRaw(overrides: Partial<SageCreditMemo> = {}): SageCreditMemo {
  return {
    id: 'cn-001',
    credit_note_number: 'CN-2024-001',
    ...overrides,
  }
}

describe('transformCreditMemo (SageBusinessCloud)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.id).toBe('cn-001')
    expect(result.creditmemoNumber).toBe('CN-2024-001')
  })

  it('falls back to id when no credit_note_number', () => {
    const result = transformCreditMemo(makeRaw({ credit_note_number: undefined }))
    expect(result.creditmemoNumber).toBe('cn-001')
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
