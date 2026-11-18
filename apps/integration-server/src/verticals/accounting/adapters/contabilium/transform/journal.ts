import { toCalendarDate } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface ContabiliumJournalLine {
  cuentaId: string
  debe: number
  haber: number
  descripcion: string
  centroCostoId: string
  [key: string]: unknown
}

export interface ContabiliumJournal {
  id: number
  descripcion: string
  fecha: string
  referencia: string
  lineas: ContabiliumJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(row: ContabiliumJournalLine): JournalLineitem {
  return {
    accountId: row.cuentaId || undefined,
    description: row.descripcion || undefined,
    debitAmount: row.debe || undefined,
    creditAmount: row.haber || undefined,
    groupId: row.centroCostoId || undefined,
  }
}

export function transformJournal(raw: ContabiliumJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.descripcion || undefined,
    reference: raw.referencia || undefined,
    lineItems: (raw.lineas ?? []).map(mapJournalLine),
    postedAt: raw.fecha ? new Date(raw.fecha) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    descripcion: journal.description,
    fecha: toCalendarDate(journal.postedAt),
    lineas: journal.lineItems?.map((li) => ({
      cuentaId: li.accountId,
      debe: li.debitAmount,
      haber: li.creditAmount,
      descripcion: li.description,
      centroCostoId: li.groupId,
    })),
  }
}
