import type { Bill, BillStatus } from '../../../schema/bill'

export interface OmieBill {
  codigo_lancamento: number
  numero_documento: string
  codigo_fornecedor: number
  data_emissao: string
  data_vencimento: string
  valor_documento: number
  valor_imposto: number
  saldo: number
  moeda: string
  status: string
  cancelada: string
  [key: string]: unknown
}

function mapStatus(raw: OmieBill): BillStatus {
  if (raw.cancelada === 'S') return 'VOIDED'
  if (raw.status === 'PAGO' || raw.saldo === 0) return 'PAID'
  if (raw.saldo > 0 && raw.saldo < raw.valor_documento) return 'PARTIALLY_PAID'
  if (raw.status === 'AUTORIZADO') return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformBill(raw: OmieBill): Bill {
  return {
    id: String(raw.codigo_lancamento),
    status: mapStatus(raw),
    billNumber: raw.numero_documento || undefined,
    contactId: raw.codigo_fornecedor ? String(raw.codigo_fornecedor) : undefined,
    currency: raw.moeda || undefined,
    totalAmount: raw.valor_documento,
    taxAmount: raw.valor_imposto,
    balanceAmount: raw.saldo,
    postedAt: raw.data_emissao ? new Date(raw.data_emissao) : undefined,
    dueAt: raw.data_vencimento ? new Date(raw.data_vencimento) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
