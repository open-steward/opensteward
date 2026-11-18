import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

/**
 * Raw stock-adjustment record surfaced via the VHSYS stock-launch endpoint
 * (POST /v2/estoque — "lançar estoque"). List reads come from GET /v2/estoque/lancamentos.
 * VHSYS does not call this a stock-adjustment but a "lançamento de estoque".
 */
export interface RawVhsysStockAdjustment {
  id_lancamento: string | number
  id_produto?: string | number
  id_deposito?: string | number
  motivo_lancamento?: string
  tipo_lancamento?: string
  situacao_lancamento?: string
  quantidade?: number | string
  quantidade_anterior?: number | string
  data_lancamento?: string
  usuario_lancamento?: string
  observacao_lancamento?: string
  [key: string]: unknown
}

function mapReason(motivo: string | undefined, tipo: string | undefined): StockAdjustmentReason {
  const r = (motivo ?? tipo ?? '').toLowerCase()
  if (r.includes('contagem') || r.includes('inventario') || r.includes('inventário')) return 'cycle_count'
  if (r.includes('dano') || r.includes('avaria')) return 'damage'
  if (r.includes('furto') || r.includes('roubo')) return 'theft'
  if (r.includes('perda') || r.includes('extravio')) return 'lost'
  if (r.includes('encontrado') || r.includes('achado')) return 'found'
  if (r.includes('vencimento') || r.includes('validade') || r.includes('expirado')) return 'expiration'
  if (r.includes('correcao') || r.includes('correção') || r.includes('ajuste')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawVhsysStockAdjustment): StockAdjustment {
  const id = String(raw.id_lancamento)
  const productId = raw.id_produto != null ? String(raw.id_produto) : ''
  const locationId = raw.id_deposito != null ? String(raw.id_deposito) : ''

  const qty = pickNum(raw.quantidade) ?? 0
  const qtyAnterior = pickNum(raw.quantidade_anterior)
  // delta = new quantity minus previous, or just the quantity itself if previous unknown
  const deltaQuantity = qtyAnterior !== undefined ? qty - qtyAnterior : qty

  return {
    id,
    externalId: id,
    locationId,
    reason: mapReason(pickStr(raw.motivo_lancamento), pickStr(raw.tipo_lancamento)),
    lines: productId
      ? [{
          productId,
          deltaQuantity,
          countedQuantity: qtyAnterior !== undefined ? qty : undefined,
          notes: pickStr(raw.observacao_lancamento),
        }]
      : [],
    adjustedAt: toIso(raw.data_lancamento) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.usuario_lancamento),
    platform: 'vhsys',
    metadata: strMap({
      motivo: raw.motivo_lancamento,
      tipo: raw.tipo_lancamento,
      situacao: raw.situacao_lancamento,
    }),
    raw,
  }
}
