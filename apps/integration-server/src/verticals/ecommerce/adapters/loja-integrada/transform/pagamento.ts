/**
 * Loja Integrada order payment (`pagamentos[]` on GET /v1/pedido/{pedido_id})
 * → canonical Transaction.
 *
 * Documented pagamento fields include `id`, `authorization_code`, `valor`,
 * `valor_pago`, `pagamento_tipo` and `forma_pagamento` (`codigo`, `id`,
 * `nome`). The API has no GET for a payment on its own, so the id is
 * `<numero>:<pagamento id>` and is read back through its order.
 *
 * `valor` is a decimal string in a currency the API never states, so no
 * `amount` is mapped (it stays in metadata). No documented field says whether
 * a payment succeeded, so neither `kind` nor `status` is claimed.
 */
import type { Transaction } from '../../../schema/transaction'
import { requireId, text } from '../util'

export interface RawLojaIntegradaPagamento {
  id: number
  authorization_code?: string | null
  forma_pagamento?: { codigo?: string | null; id?: number; nome?: string | null } | null
  [key: string]: unknown
}

export function transformPagamento(
  orderNumero: string,
  raw: RawLojaIntegradaPagamento,
): Transaction {
  const gateway = text(raw.forma_pagamento?.codigo)
  const authorizationCode = text(raw.authorization_code)
  return {
    id: `${orderNumero}:${requireId(raw.id, 'payment')}`,
    orderId: orderNumero,
    ...(gateway ? { gateway } : {}),
    ...(authorizationCode ? { authorizationCode } : {}),
    metadata: { ...raw },
  }
}
