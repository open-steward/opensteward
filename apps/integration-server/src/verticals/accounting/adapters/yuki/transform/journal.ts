import { toCalendarDate } from '../../shared/transform'
/**
 * Yuki general journal transform.
 *
 * Journals are submitted via Accounting.asmx → ProcessJournal (write-only).
 * The Journal XML namespace: urn:xmlns:http://www.theyukicompany.com:journal
 *
 * ProcessJournal XML fields:
 *   AdministrationID   — required (or AdministrationCoCNumber)
 *   DocumentSubject    — human-readable name for the journal entry
 *   JournalType        — "GeneralJournal" | "EndOfYearCorrection" | "FiscalCorrection"
 *   ProjectID          — optional project link
 *
 * JournalEntry fields:
 *   ContactCode        — optional (references existing contact by code)
 *   ContactName        — used if ContactCode absent
 *   EntryDate          — YYYY-MM-DD
 *   GLAccount          — GL account code (from chart of accounts)
 *   Amount             — positive = debit, negative = credit (EUR)
 *   Description        — max 256 chars
 */

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'
import { extractFirst, extractBlocks, unescapeXml } from '../client'

// ── Yuki raw types (parsed from SOAP XML response) ───────────────────────────

export interface YukiJournalRow {
  GLAccount: string
  Amount: string
  Description: string
  ContactCode: string
  EntryDate: string
  [key: string]: unknown
}

export interface YukiJournal {
  DocumentSubject: string
  JournalType: string
  AdministrationID: string
  Entries: YukiJournalRow[]
  [key: string]: unknown
}

// ── XML → YukiJournal ────────────────────────────────────────────────────────

export function parseJournalXml(innerXml: string): YukiJournal | undefined {
  const subject = unescapeXml(extractFirst(innerXml, 'DocumentSubject'))
  const journalType = unescapeXml(extractFirst(innerXml, 'JournalType'))
  const administrationID = unescapeXml(extractFirst(innerXml, 'AdministrationID'))
  const entryBlocks = extractBlocks(innerXml, 'Entry')

  const entries: YukiJournalRow[] = entryBlocks.map((block) => ({
    GLAccount: unescapeXml(extractFirst(block, 'GLAccount')),
    Amount: unescapeXml(extractFirst(block, 'Amount')),
    Description: unescapeXml(extractFirst(block, 'Description')),
    ContactCode: unescapeXml(extractFirst(block, 'ContactCode')),
    EntryDate: unescapeXml(extractFirst(block, 'EntryDate')),
  }))

  if (!subject && !entries.length) return undefined

  return { DocumentSubject: subject, JournalType: journalType, AdministrationID: administrationID, Entries: entries }
}

// ── Transform ─────────────────────────────────────────────────────────────────

function mapJournalRow(row: YukiJournalRow, idx: number): JournalLineitem {
  const amount = row.Amount ? parseFloat(row.Amount) : 0
  return {
    id: String(idx + 1),
    accountId: row.GLAccount || undefined,
    contactId: row.ContactCode || undefined,
    description: row.Description || undefined,
    debitAmount: amount > 0 ? amount : undefined,
    creditAmount: amount < 0 ? Math.abs(amount) : undefined,
  }
}

export function transformJournal(raw: YukiJournal): Journal {
  const entries = raw.Entries ?? []
  const firstDate = entries[0]?.EntryDate
  return {
    id: raw.DocumentSubject || undefined,
    description: raw.DocumentSubject || undefined,
    source: raw.JournalType || undefined,
    lineItems: entries.map(mapJournalRow),
    postedAt: firstDate ? new Date(firstDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (canonical → Yuki ProcessJournal XML) ────────────────────────

function escXml(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function dateStr(d?: string | Date): string {
  // Accepts the canonical `Date | 'YYYY-MM-DD'` union: a date-only source keeps
  // its precision rather than being widened to a fabricated UTC instant.
  return toCalendarDate(d) ?? ''
}

export function untransformJournal(journal: Partial<Journal>, administrationId: string): string {
  const entries = (journal.lineItems ?? [])
    .map((li) => {
      const amount =
        (li.debitAmount ?? 0) > 0
          ? (li.debitAmount ?? 0)
          : -(li.creditAmount ?? 0)
      const entryDate = dateStr(journal.postedAt)
      const contactLine = li.contactId
        ? `      <ContactCode>${escXml(li.contactId)}</ContactCode>`
        : ''
      return `    <Entry>
${contactLine}
      <EntryDate>${entryDate}</EntryDate>
      <GLAccount>${escXml(li.accountId ?? '')}</GLAccount>
      <Amount>${amount}</Amount>
      <Description>${escXml((li.description ?? '').slice(0, 256))}</Description>
    </Entry>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="utf-8"?>
<Journal xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xmlns="urn:xmlns:http://www.theyukicompany.com:journal"
         xsi:schemaLocation="urn:xmlns:http://www.theyukicompany.com:journal journal.xsd">
  <Administration>
    <AdministrationID>${escXml(administrationId)}</AdministrationID>
  </Administration>
  <DocumentSubject>${escXml(journal.description ?? '')}</DocumentSubject>
  <JournalType>GeneralJournal</JournalType>
  <Entries>
${entries}
  </Entries>
</Journal>`
}
