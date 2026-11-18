import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface SnelStartBoekingRegel {
  id: string
  omschrijving: string
  grootboekrekening: { id: string } | null
  debet: number
  credit: number
  [key: string]: unknown
}

export interface SnelStartBoeking {
  id: string
  omschrijving: string
  boekstuknummer: string
  datum: string
  boekingsregels: SnelStartBoekingRegel[]
  [key: string]: unknown
}

function mapLine(row: SnelStartBoekingRegel): JournalLineitem {
  return {
    id: row.id,
    accountId: row.grootboekrekening?.id || undefined,
    description: row.omschrijving || undefined,
    debitAmount: row.debet || undefined,
    creditAmount: row.credit || undefined,
  }
}

export function transformJournal(raw: SnelStartBoeking): Journal {
  return {
    id: raw.id,
    description: raw.omschrijving || undefined,
    reference: raw.boekstuknummer || undefined,
    lineItems: (raw.boekingsregels ?? []).map(mapLine),
    postedAt: raw.datum ? new Date(raw.datum) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
