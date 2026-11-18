import { describe, it, expect } from 'vitest'
import {
  transformPagamento,
  type RawLojaIntegradaPagamento,
} from '../../../../../../../src/verticals/ecommerce/adapters/loja-integrada/transform/pagamento'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'
import { PEDIDO_DETAIL } from '../fixtures'

const pagamento = PEDIDO_DETAIL.pagamentos[0] as RawLojaIntegradaPagamento

describe('transformPagamento (loja-integrada)', () => {
  it('maps a documented pagamentos[] row to a valid Transaction', () => {
    const t = TransactionSchema.parse(transformPagamento('165', pagamento))
    expect(t).toMatchObject({ id: '165:69291176', orderId: '165', gateway: 'pagsegurov2' })
    // No currency is documented, and no field says whether it succeeded.
    expect(t.amount).toBeUndefined()
    expect(t.status).toBeUndefined()
    expect(t.kind).toBeUndefined()
    expect(t.authorizationCode).toBeUndefined()
  })

  it('maps authorization_code when the gateway returned one', () => {
    const t = TransactionSchema.parse(
      transformPagamento('165', { ...pagamento, authorization_code: 'A1B2C3' }),
    )
    expect(t.authorizationCode).toBe('A1B2C3')
  })
})
