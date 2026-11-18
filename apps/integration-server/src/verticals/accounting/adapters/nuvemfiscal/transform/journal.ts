import { toCalendarDate } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface NuvemFiscalLancamentoLinha {
  id_conta: number
  debito: number
  credito: number
  descricao: string
  centro_custo: string
  projeto: string
  [key: string]: unknown
}

export interface NuvemFiscalLancamento {
  id_lancamento: number
  numero: number
  descricao: string
  data_lancamento: string
  referencia: string
  linhas: NuvemFiscalLancamentoLinha[]
  [key: string]: unknown
}

function mapLine(row: NuvemFiscalLancamentoLinha): JournalLineitem {
  return {
    accountId: row.id_conta ? String(row.id_conta) : undefined,
    description: row.descricao || undefined,
    debitAmount: row.debito || undefined,
    creditAmount: row.credito || undefined,
    groupId: row.centro_custo || undefined,
    projectId: row.projeto || undefined,
  }
}

export function transformJournal(raw: NuvemFiscalLancamento): Journal {
  return {
    id: String(raw.id_lancamento),
    description: raw.descricao || undefined,
    reference: raw.referencia || undefined,
    lineItems: (raw.linhas ?? []).map(mapLine),
    postedAt: raw.data_lancamento ? new Date(raw.data_lancamento) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    descricao: journal.description,
    data_lancamento: toCalendarDate(journal.postedAt),
    linhas: journal.lineItems?.map((li) => ({
      id_conta: li.accountId ? Number(li.accountId) : undefined,
      debito: li.debitAmount,
      credito: li.creditAmount,
      descricao: li.description,
      centro_custo: li.groupId,
      projeto: li.projectId,
    })),
  }
}
