/**
 * Loja Integrada order (GET /v1/pedido/search, GET /v1/pedido/{pedido_id}) →
 * canonical Order.
 *
 * An order is addressed by its `numero`: the documented answers pair
 * `"numero": 165` with `"resource_uri": "/api/v1/pedido/165"`, and the
 * single-order path's example `pedido_id` is "165". So `numero` is the id.
 *
 * `cliente` is a URI on the search answer (`"/api/v1/cliente/34220641"`) and
 * an object with `id` and `email` on the single-order answer. The single-order
 * answer also carries `endereco_entrega`, `cliente_obs`, `envios` and
 * `pagamentos`; the envio and pagamento ids are listed as
 * `fulfillmentIds` / `transactionIds` in the form the fulfillment and
 * transaction reads take (`<numero>:<id>`).
 *
 * Not mapped, for want of a documented source:
 *  - every money field and `lineItems`: `valor_total`, `preco_venda` etc. are
 *    decimal strings, and the API never states their currency (canonical
 *    money needs one; a currency is never assumed);
 *  - `financialStatus` / `fulfillmentStatus`: `situacao` is the store's own
 *    configurable status (`codigo`, `aprovado`, `cancelado`), kept in metadata;
 *  - timestamps: naive local times in an undocumented zone (see `zonedIso`).
 */
import { z } from 'zod'
import type { Order } from '../../../schema/order'
import { idFromUri, requireId, text, zonedIso } from '../util'
import { toAddress, type RawLojaIntegradaEndereco } from './cliente'

export interface RawLojaIntegradaPedido {
  numero: number
  cliente?: string | { id?: number; email?: string | null } | null
  cliente_obs?: string | null
  endereco_entrega?: RawLojaIntegradaEndereco | null
  envios?: Array<{ id?: number }>
  pagamentos?: Array<{ id?: number }>
  data_criacao?: string | null
  data_modificacao?: string | null
  [key: string]: unknown
}

function customerIdOf(cliente: RawLojaIntegradaPedido['cliente']): string | undefined {
  if (typeof cliente === 'string') return idFromUri(cliente, 'cliente')
  if (cliente && typeof cliente.id === 'number') return String(cliente.id)
  return undefined
}

function childIds(numero: string, rows: Array<{ id?: number }> | undefined): string[] | undefined {
  if (!Array.isArray(rows)) return undefined
  return rows.filter((r) => typeof r.id === 'number').map((r) => `${numero}:${r.id}`)
}

export function transformPedido(raw: RawLojaIntegradaPedido): Order {
  const id = requireId(raw.numero, 'order (numero)')
  const customerId = customerIdOf(raw.cliente)
  const email =
    raw.cliente && typeof raw.cliente === 'object'
      ? z.email().safeParse(raw.cliente.email)
      : undefined
  const note = text(raw.cliente_obs)
  const fulfillmentIds = childIds(id, raw.envios)
  const transactionIds = childIds(id, raw.pagamentos)
  const createdAt = zonedIso(raw.data_criacao)
  const updatedAt = zonedIso(raw.data_modificacao)
  return {
    id,
    orderNumber: id,
    ...(customerId ? { customerId } : {}),
    ...(email?.success ? { email: email.data } : {}),
    ...(raw.endereco_entrega ? { shippingAddress: toAddress(raw.endereco_entrega) } : {}),
    ...(fulfillmentIds ? { fulfillmentIds } : {}),
    ...(transactionIds ? { transactionIds } : {}),
    ...(note ? { note } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    metadata: { ...raw },
  }
}
