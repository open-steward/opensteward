import { toCalendarDate } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface XubioJournalLine {
  cuentaId: number
  debe: number
  haber: number
  descripcion: string
  centroCostoId: string
  proyectoId: string
  [key: string]: unknown
}

export interface XubioJournal {
  id: number
  descripcion: string
  fecha: string
  referencia: string
  lineas: XubioJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(row: XubioJournalLine): JournalLineitem {
  return {
    accountId: row.cuentaId ? String(row.cuentaId) : undefined,
    description: row.descripcion || undefined,
    debitAmount: row.debe || undefined,
    creditAmount: row.haber || undefined,
    groupId: row.centroCostoId || undefined,
    projectId: row.proyectoId || undefined,
  }
}

export function transformJournal(raw: XubioJournal): Journal {
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
      cuentaId: li.accountId ? Number(li.accountId) : undefined,
      debe: li.debitAmount,
      haber: li.creditAmount,
      descripcion: li.description,
      centroCostoId: li.groupId,
      proyectoId: li.projectId,
    })),
  }
}
