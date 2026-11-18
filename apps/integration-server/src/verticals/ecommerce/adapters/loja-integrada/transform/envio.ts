/**
 * Loja Integrada order shipment (`envios[]` on GET /v1/pedido/{pedido_id}) →
 * canonical Fulfillment.
 *
 * Documented envio fields: `id`, `objeto` (the tracking code, null until
 * posted), `prazo`, `valor`, `data_criacao`, `data_modificacao` and
 * `forma_envio` (`code`, `id`, `nome`, `tipo`). The API has no GET for a
 * shipment on its own (/v1/pedido_envio/{id} is documented for PUT only), so
 * the id is `<numero>:<envio id>` and is read back through its order.
 */
import type { Fulfillment } from '../../../schema/fulfillment'
import { requireId, text, zonedIso } from '../util'

export interface RawLojaIntegradaEnvio {
  id: number
  objeto?: string | null
  forma_envio?: {
    code?: string | null
    id?: number
    nome?: string | null
    tipo?: string | null
  } | null
  data_criacao?: string | null
  data_modificacao?: string | null
  [key: string]: unknown
}

export function transformEnvio(orderNumero: string, raw: RawLojaIntegradaEnvio): Fulfillment {
  const tracking = text(raw.objeto)
  const carrier = text(raw.forma_envio?.nome)
  const service = text(raw.forma_envio?.code)
  const createdAt = zonedIso(raw.data_criacao)
  const updatedAt = zonedIso(raw.data_modificacao)
  return {
    id: `${orderNumero}:${requireId(raw.id, 'shipment')}`,
    orderId: orderNumero,
    ...(tracking ? { trackingNumber: tracking } : {}),
    ...(carrier ? { carrier } : {}),
    ...(service ? { service } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    metadata: { ...raw },
  }
}
