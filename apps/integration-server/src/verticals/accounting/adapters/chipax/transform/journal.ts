import { toCalendarDate } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface ChipaxJournalLine {
  cuentaId: string
  debe: number
  haber: number
  descripcion: string
  centroId: string
  [key: string]: unknown
}

export interface ChipaxJournal {
  id: number
  descripcion: string
  fechaTransaccion: string
  referencia: string
  lineas: ChipaxJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(row: ChipaxJournalLine): JournalLineitem {
  return {
    accountId: row.cuentaId || undefined,
    description: row.descripcion || undefined,
    debitAmount: row.debe || undefined,
    creditAmount: row.haber || undefined,
    groupId: row.centroId || undefined,
  }
}

export function transformJournal(raw: ChipaxJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.descripcion || undefined,
    reference: raw.referencia || undefined,
    lineItems: (raw.lineas ?? []).map(mapJournalLine),
    postedAt: raw.fechaTransaccion ? new Date(raw.fechaTransaccion) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    descripcion: journal.description,
    fechaTransaccion: toCalendarDate(journal.postedAt),
    lineas: journal.lineItems?.map((li) => ({
      cuentaId: li.accountId,
      debe: li.debitAmount,
      haber: li.creditAmount,
      descripcion: li.description,
      centroId: li.groupId,
    })),
  }
}
