import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  type OctopusBooking,
  type OctopusBookingLine,
} from '../../../../../../../src/verticals/accounting/adapters/octopus/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

const sampleLine: OctopusBookingLine = {
  lineId: 1,
  accountNumber: '600000',
  description: 'Purchase expense',
  debitAmount: 5000,
  creditAmount: undefined,
  vatAmount: 1050,
  contactId: 300,
}

function makeRaw(overrides: Partial<OctopusBooking> = {}): OctopusBooking {
  return {
    bookingId: 9001,
    journalNumber: 'BK-001',
    description: 'Purchase booking',
    reference: 'VEND-INV-50',
    bookingDate: '2024-08-15',
    currency: 'EUR',
    vatAmount: 1050,
    source: 'AP',
    lines: [sampleLine],
    ...overrides,
  }
}

describe('transformJournal (octopus)', () => {
  it('maps bookingId to id (string) when present', () => {
    expect(transformJournal(makeRaw()).id).toBe('9001')
  })

  it('falls back to journalNumber as id when bookingId absent', () => {
    expect(transformJournal(makeRaw({ bookingId: undefined })).id).toBe('BK-001')
  })

  it('maps description', () => {
    expect(transformJournal(makeRaw()).description).toBe('Purchase booking')
  })

  it('maps reference', () => {
    expect(transformJournal(makeRaw()).reference).toBe('VEND-INV-50')
  })

  it('falls back reference to journalNumber when reference absent', () => {
    expect(transformJournal(makeRaw({ reference: undefined })).reference).toBe('BK-001')
  })

  it('maps currency', () => {
    expect(transformJournal(makeRaw()).currency).toBe('EUR')
  })

  it('maps vatAmount to taxAmount', () => {
    expect(transformJournal(makeRaw()).taxAmount).toBe(1050)
  })

  it('maps bookingDate to postedAt', () => {
    expect(transformJournal(makeRaw()).postedAt).toEqual(new Date('2024-08-15'))
  })

  it('maps lineitem accountNumber to accountId', () => {
    expect(transformJournal(makeRaw()).lineItems![0].accountId).toBe('600000')
  })

  it('maps lineitem debitAmount', () => {
    expect(transformJournal(makeRaw()).lineItems![0].debitAmount).toBe(5000)
  })

  it('maps lineitem contactId (string)', () => {
    expect(transformJournal(makeRaw()).lineItems![0].contactId).toBe('300')
  })

  it('passes JournalSchema.parse without throwing', () => {
    expect(() => JournalSchema.parse(transformJournal(makeRaw()))).not.toThrow()
  })
})
