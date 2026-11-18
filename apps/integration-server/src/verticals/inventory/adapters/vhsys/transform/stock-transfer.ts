import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

/**
 * Raw stock-transfer record — VHSYS v2 does not publish a dedicated
 * stock-transfer endpoint in its public API. This type describes the minimal
 * shape that would be returned if such a record were surfaced (e.g. via a
 * custom integration or future API version).
 */
export interface RawVhsysStockTransfer {
  id_transferencia: string | number
  numero_transferencia?: string | number
  id_deposito_origem?: string | number
  id_deposito_destino?: string | number
  situacao_transferencia?: string
  data_transferencia?: string
  data_recebimento?: string
  itens?: Array<{
    id_produto?: string | number
    quantidade?: number | string
    quantidade_recebida?: number | string
  }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  const upper = (s ?? '').toUpperCase()
  if (upper === 'RASCUNHO' || upper === 'DRAFT') return 'draft'
  if (upper === 'EM TRANSITO' || upper === 'EM TRÂNSITO' || upper === 'ENVIADO') return 'in_transit'
  if (upper === 'RECEBIDO' || upper === 'CONCLUIDO' || upper === 'CONCLUÍDO') return 'completed'
  if (upper === 'CANCELADO' || upper === 'ANULADO') return 'cancelled'
  return 'draft'
}

export function transformStockTransfer(raw: RawVhsysStockTransfer): StockTransfer {
  const id = String(raw.id_transferencia)

  return {
    id,
    externalId: id,
    number: raw.numero_transferencia != null ? String(raw.numero_transferencia) : undefined,
    fromLocationId: raw.id_deposito_origem != null ? String(raw.id_deposito_origem) : '',
    toLocationId: raw.id_deposito_destino != null ? String(raw.id_deposito_destino) : '',
    status: mapStatus(pickStr(raw.situacao_transferencia)),
    lines: (raw.itens ?? []).map((l) => ({
      productId: l.id_produto != null ? String(l.id_produto) : '',
      quantity: pickNum(l.quantidade) ?? 0,
      quantityReceived: pickNum(l.quantidade_recebida),
    })),
    shippedAt: toIso(raw.data_transferencia),
    receivedAt: toIso(raw.data_recebimento),
    platform: 'vhsys',
    metadata: strMap({}),
    raw,
  }
}
