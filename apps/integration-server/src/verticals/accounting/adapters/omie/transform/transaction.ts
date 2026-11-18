import type { Transaction, TransactionContact } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface OmieTransaction {
  codigo_lancamento: number
  data_lancamento: string
  valor: number
  moeda: string
  tipo: string
  conta_contabil: number
  referencia: string
  codigo_cliente: number
  nome_cliente: string
  descricao: string
  [key: string]: unknown
}

function mapLineitems(raw: OmieTransaction): TransactionLineitem[] {
  return [
    {
      accountId: raw.conta_contabil ? String(raw.conta_contabil) : undefined,
      name: raw.descricao || undefined,
      totalAmount: raw.valor,
    },
  ]
}

export function transformTransaction(raw: OmieTransaction): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.codigo_cliente) {
    contacts.push({ id: String(raw.codigo_cliente), name: raw.nome_cliente || undefined })
  }

  return {
    id: String(raw.codigo_lancamento),
    accountId: raw.conta_contabil ? String(raw.conta_contabil) : undefined,
    type: raw.tipo || undefined,
    reference: raw.referencia || undefined,
    currency: raw.moeda || undefined,
    totalAmount: raw.valor,
    contacts: contacts.length > 0 ? contacts : undefined,
    lineItems: mapLineitems(raw),
    createdAt: raw.data_lancamento ? new Date(raw.data_lancamento) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
