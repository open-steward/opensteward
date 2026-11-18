import { describe, it, expect } from 'vitest'
import { transformExpense } from '../../../../../../../src/verticals/accounting/adapters/yuki/transform/expense'

describe('transformExpense (yuki)', () => {
  it('throws because expenses are not available in the Yuki SOAP API', () => {
    // Yuki SOAP API does not expose expenses; this transform is a placeholder.
    expect(() => transformExpense({})).toThrow(
      'Yuki: expense endpoint is not available in the SOAP API',
    )
  })
})
