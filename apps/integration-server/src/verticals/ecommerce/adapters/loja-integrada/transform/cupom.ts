/**
 * Loja Integrada coupon (GET /v1/cupom, GET /v1/cupom/{cupom_id}) → canonical
 * Discount.
 *
 * Enumerations are those POST /v1/cupom documents:
 *  - "O campo **tipo** aceita os seguintes valores: porcentagem, frete_gratis,
 *    fixo" → PERCENTAGE, FREE_SHIPPING, FIXED_AMOUNT;
 *  - "O campo **condicao_cliente** aceita os seguintes valores: todos_clientes,
 *    grupos_selecionados, clientes_selecionados" → ALL, SPECIFIC, SPECIFIC.
 *
 * `valor` is mapped only for a percentage (it is then a percent, "10.00").
 * For `fixo` it is an amount in a currency the API never states, and
 * `valor_minimo` likewise, so neither is mapped (both stay in metadata).
 * `produtos` / `categorias` (single-coupon answer only) are id lists.
 * `validade` is a naive date in an undocumented zone and is not mapped.
 */
import type { Discount } from '../../../schema/discount'
import { requireId, text } from '../util'

export interface RawLojaIntegradaCupom {
  id: number
  codigo?: string | null
  descricao?: string | null
  tipo?: string | null
  valor?: string | null
  condicao_cliente?: string | null
  quantidade?: number | null
  quantidade_usada?: number | null
  produtos?: Array<number | string>
  categorias?: Array<number | string>
  [key: string]: unknown
}

const TYPE: Record<string, Discount['type']> = {
  porcentagem: 'PERCENTAGE',
  frete_gratis: 'FREE_SHIPPING',
  fixo: 'FIXED_AMOUNT',
}

const ELIGIBILITY: Record<string, Discount['customerEligibility']> = {
  todos_clientes: 'ALL',
  grupos_selecionados: 'SPECIFIC',
  clientes_selecionados: 'SPECIFIC',
}

function count(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined
}

export function transformCupom(raw: RawLojaIntegradaCupom): Discount {
  const type = raw.tipo ? (TYPE[raw.tipo] ?? 'unknown') : undefined
  const percent = type === 'PERCENTAGE' && raw.valor != null ? Number(raw.valor) : NaN
  const eligibility = raw.condicao_cliente
    ? (ELIGIBILITY[raw.condicao_cliente] ?? 'unknown')
    : undefined
  const code = text(raw.codigo)
  const title = text(raw.descricao)
  const usageLimit = count(raw.quantidade)
  const usageCount = count(raw.quantidade_usada)
  return {
    id: requireId(raw.id, 'coupon'),
    ...(code ? { code } : {}),
    ...(title ? { title } : {}),
    ...(type ? { type } : {}),
    ...(Number.isFinite(percent) && percent >= 0 ? { value: percent } : {}),
    ...(eligibility ? { customerEligibility: eligibility } : {}),
    ...(Array.isArray(raw.produtos) ? { productIds: raw.produtos.map(String) } : {}),
    ...(Array.isArray(raw.categorias) ? { collectionIds: raw.categorias.map(String) } : {}),
    ...(usageLimit !== undefined ? { usageLimit } : {}),
    ...(usageCount !== undefined ? { usageCount } : {}),
    metadata: { ...raw },
  }
}
