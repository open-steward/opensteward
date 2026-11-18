import type { Rate } from '../../../schema/rate'
import { parseDecimal } from '../../shared/transform'

// ─── Correios raw types ─────────────────────────────────────────────────────

export interface CorreiosPreco {
  coProduto: string
  pcFinal: string | number
  pcBase: string | number | null
  prazoEntrega: number | null
  txErro: string | null
  [key: string]: unknown
}

export interface CorreiosRateResponse {
  precos: CorreiosPreco[]
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(raw: CorreiosPreco): Rate {
  return {
    id: raw.coProduto,
    carrierId: 'correios',
    serviceCode: raw.coProduto,
    currency: 'BRL',
    totalAmount: parseDecimal(raw.pcFinal),
    transitDays: raw.prazoEntrega ?? undefined,
    deliveryDays: raw.prazoEntrega ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
