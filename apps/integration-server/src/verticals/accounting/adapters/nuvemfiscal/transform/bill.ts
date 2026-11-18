import { toCalendarDate } from '../../shared/transform'
import type { Bill, BillStatus } from '../../../schema/bill'

export interface NuvemFiscalBill {
  id_fatura_fornecedor: number
  numero_fatura: string
  id_fornecedor: number
  nome_fornecedor: string
  valor_total: number
  valor_impostos: number
  saldo: number
  moeda: string
  data_emissao: string
  data_vencimento: string
  status: string
  cancelada: boolean
  [key: string]: unknown
}

function mapStatus(raw: NuvemFiscalBill): BillStatus {
  if (raw.cancelada) return 'VOIDED'
  if (raw.saldo === 0 && raw.valor_total > 0) return 'PAID'
  if (raw.saldo > 0 && raw.saldo < raw.valor_total) return 'PARTIALLY_PAID'
  if (raw.status === 'autorizada') return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformBill(raw: NuvemFiscalBill): Bill {
  return {
    id: String(raw.id_fatura_fornecedor),
    status: mapStatus(raw),
    billNumber: raw.numero_fatura || undefined,
    contactId: raw.id_fornecedor ? String(raw.id_fornecedor) : undefined,
    currency: raw.moeda || undefined,
    totalAmount: raw.valor_total,
    taxAmount: raw.valor_impostos,
    balanceAmount: raw.saldo,
    postedAt: raw.data_emissao ? new Date(raw.data_emissao) : undefined,
    dueAt: raw.data_vencimento ? new Date(raw.data_vencimento) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformBill(bill: Partial<Bill>): Record<string, unknown> {
  return {
    id_fornecedor: bill.contactId ? Number(bill.contactId) : undefined,
    moeda: bill.currency,
    data_emissao: toCalendarDate(bill.postedAt),
    data_vencimento: toCalendarDate(bill.dueAt),
  }
}
