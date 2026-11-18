import { toCalendarDate } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface OmieJournalLine {
  conta_contabil: number
  valor_debito: number
  valor_credito: number
  descricao: string
  centro_custo: string
  projeto: string
  [key: string]: unknown
}

export interface OmieJournal {
  codigo_lancamento: number
  descricao: string
  data_lancamento: string
  referencia: string
  linhas: OmieJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(row: OmieJournalLine): JournalLineitem {
  return {
    accountId: row.conta_contabil ? String(row.conta_contabil) : undefined,
    description: row.descricao || undefined,
    debitAmount: row.valor_debito || undefined,
    creditAmount: row.valor_credito || undefined,
    groupId: row.centro_custo || undefined,
    projectId: row.projeto || undefined,
  }
}

export function transformJournal(raw: OmieJournal): Journal {
  return {
    id: String(raw.codigo_lancamento),
    description: raw.descricao || undefined,
    reference: raw.referencia || undefined,
    lineItems: (raw.linhas ?? []).map(mapJournalLine),
    postedAt: raw.data_lancamento ? new Date(raw.data_lancamento) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    descricao: journal.description,
    data_lancamento: toCalendarDate(journal.postedAt),
    linhas: journal.lineItems?.map((li) => ({
      conta_contabil: li.accountId ? Number(li.accountId) : undefined,
      valor_debito: li.debitAmount,
      valor_credito: li.creditAmount,
      descricao: li.description,
      centro_custo: li.groupId,
      projeto: li.projectId,
    })),
  }
}
