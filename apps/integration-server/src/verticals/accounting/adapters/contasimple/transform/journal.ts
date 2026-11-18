import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface ContasimpleJournalLine {
  cuenta: string
  descripcion: string
  debe: number
  haber: number
  [key: string]: unknown
}

export interface ContasimpleJournal {
  id: string
  numero: string
  descripcion: string
  fecha: string
  lineas: ContasimpleJournalLine[]
  [key: string]: unknown
}

function mapLine(line: ContasimpleJournalLine): JournalLineitem {
  return {
    accountId: line.cuenta || undefined,
    description: line.descripcion || undefined,
    debitAmount: line.debe || undefined,
    creditAmount: line.haber || undefined,
  }
}

export function transformJournal(raw: ContasimpleJournal): Journal {
  return {
    id: raw.id,
    description: raw.descripcion || undefined,
    reference: raw.numero || undefined,
    lineItems: (raw.lineas ?? []).map(mapLine),
    postedAt: raw.fecha ? new Date(raw.fecha) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
