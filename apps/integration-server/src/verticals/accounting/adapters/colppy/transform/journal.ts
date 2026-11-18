import { toCalendarDate } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface ColppyAsientoLinea {
  idCuenta: number
  debe: number
  haber: number
  descripcion: string
  centroCosto: string
  proyecto: string
  [key: string]: unknown
}

export interface ColppyAsiento {
  idAsiento: number
  numero: number
  descripcion: string
  fecha: string
  referencia: string
  lineas: ColppyAsientoLinea[]
  [key: string]: unknown
}

function mapLine(row: ColppyAsientoLinea): JournalLineitem {
  return {
    accountId: row.idCuenta ? String(row.idCuenta) : undefined,
    description: row.descripcion || undefined,
    debitAmount: row.debe || undefined,
    creditAmount: row.haber || undefined,
    groupId: row.centroCosto || undefined,
    projectId: row.proyecto || undefined,
  }
}

export function transformJournal(raw: ColppyAsiento): Journal {
  return {
    id: String(raw.idAsiento),
    description: raw.descripcion || undefined,
    reference: raw.referencia || undefined,
    lineItems: (raw.lineas ?? []).map(mapLine),
    postedAt: raw.fecha ? new Date(raw.fecha) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    descripcion: journal.description,
    fecha: toCalendarDate(journal.postedAt),
    lineas: journal.lineItems?.map((li) => ({
      idCuenta: li.accountId ? Number(li.accountId) : undefined,
      debe: li.debitAmount,
      haber: li.creditAmount,
      descripcion: li.description,
      centroCosto: li.groupId,
      proyecto: li.projectId,
    })),
  }
}
