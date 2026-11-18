import { describe, it, expect } from 'vitest'
import { transformBill } from '../../../../../../../src/verticals/accounting/adapters/yuki/transform/bill'

describe('transformBill (yuki)', () => {
  it('throws because the Yuki SOAP API does not expose purchase invoices', () => {
    // Yuki requires a separate formal agreement for the Purchase webservice.
    // The transform is a placeholder that always throws to surface this clearly.
    expect(() => transformBill({})).toThrow(
      'Yuki: bill (purchase invoice) endpoint is not available without special API access',
    )
  })
})
