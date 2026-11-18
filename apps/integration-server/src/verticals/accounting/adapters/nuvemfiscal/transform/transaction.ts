import type { Transaction, TransactionContact } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface NuvemFiscalMovimentacao {
  id_movimentacao: number
  id_conta: number
  tipo: string
  referencia: string
  moeda: string
  valor: number
  data_movimentacao: string
  id_cliente: number
  nome_cliente: string
  detalhes: NuvemFiscalMovimentacaoDetalhe[]
  [key: string]: unknown
}

export interface NuvemFiscalMovimentacaoDetalhe {
  id_conta: number
  nome: string
  descricao: string
  valor: number
  [key: string]: unknown
}

function mapLineitems(raw: NuvemFiscalMovimentacao): TransactionLineitem[] {
  const items: TransactionLineitem[] = [
    {
      accountId: raw.id_conta ? String(raw.id_conta) : undefined,
      name: raw.tipo || undefined,
      totalAmount: raw.valor,
    },
  ]
  for (const det of raw.detalhes ?? []) {
    items.push({
      accountId: det.id_conta ? String(det.id_conta) : undefined,
      name: det.nome || undefined,
      description: det.descricao || undefined,
      totalAmount: det.valor,
    })
  }
  return items
}

export function transformTransaction(raw: NuvemFiscalMovimentacao): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.id_cliente) {
    contacts.push({ id: String(raw.id_cliente), name: raw.nome_cliente || undefined })
  }

  return {
    id: String(raw.id_movimentacao),
    accountId: raw.id_conta ? String(raw.id_conta) : undefined,
    type: raw.tipo || undefined,
    reference: raw.referencia || undefined,
    currency: raw.moeda || undefined,
    totalAmount: raw.valor,
    contacts: contacts.length > 0 ? contacts : undefined,
    lineItems: mapLineitems(raw),
    createdAt: raw.data_movimentacao ? new Date(raw.data_movimentacao) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
