import { describe, it, expect } from 'vitest'
import { transformCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/yuki/transform/creditmemo'

describe('transformCreditMemo (yuki)', () => {
  it('throws because credit memos are not available in the Yuki SOAP API', () => {
    // Yuki SOAP API does not expose credit memos; this transform is a placeholder.
    expect(() => transformCreditMemo({})).toThrow(
      'Yuki: credit memo endpoint is not available in the SOAP API',
    )
  })
})
