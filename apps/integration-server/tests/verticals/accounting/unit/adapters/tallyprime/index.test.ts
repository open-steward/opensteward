/**
 * Request-pinning tests: listBills/getBill, listJournals/getJournal
 * and listTransactions/getTransaction must send the documented
 * Export/Collection Type=Voucher request (voucher-collection-payload) — NOT
 * invoice's undocumented `Export Data` + `Voucher Register` + SVVOUCHERTYPE
 * request just above it in index.ts — and must parse the nested
 * `ALLLEDGERENTRIES.LIST` the invoice parser skips.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import axios from 'axios'
import { TallyPrimeAdapter } from '../../../../../../src/verticals/accounting/adapters/tallyprime'

const CREDENTIALS = { accessToken: 'local', extra: { baseUrl: 'https://tally.example.com/xml' } }

afterEach(() => {
  vi.restoreAllMocks()
})

function mockResponse(xml: string) {
  return vi.spyOn(axios, 'post').mockResolvedValue({ data: xml })
}

function postedBody(post: ReturnType<typeof mockResponse>): string {
  const call = post.mock.calls[0]
  if (!call) throw new Error('expected axios.post to have been called')
  return call[1] as string
}

const PURCHASE_VOUCHER_XML = `<ENVELOPE><BODY><DATA><COLLECTION>
  <VOUCHER REMOTEID="r1" VCHKEY="k1" VCHTYPE="Purchase" ACTION="Create">
    <DATE>2024-03-15</DATE>
    <GUID>84f4d69e-1a2b-4c3d-9e0f-1234567890ab</GUID>
    <MASTERID>4521</MASTERID>
    <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
    <VOUCHERNUMBER>PUR/2024/001</VOUCHERNUMBER>
    <PARTYLEDGERNAME>Supplier Co</PARTYLEDGERNAME>
    <NARRATION>Office supplies purchase</NARRATION>
    <AMOUNT>-5000.00</AMOUNT>
    <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>Purchase Account</LEDGERNAME>
      <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
      <AMOUNT>5000.00</AMOUNT>
    </ALLLEDGERENTRIES.LIST>
    <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>Supplier Co</LEDGERNAME>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
      <AMOUNT>-5000.00</AMOUNT>
    </ALLLEDGERENTRIES.LIST>
  </VOUCHER>
</COLLECTION></DATA></BODY></ENVELOPE>`

const JOURNAL_VOUCHER_XML = `<ENVELOPE><BODY><DATA><COLLECTION>
  <VOUCHER REMOTEID="r2" VCHKEY="k2" VCHTYPE="Journal" ACTION="Create">
    <DATE>2024-06-30</DATE>
    <GUID>a1b2c3d4-e5f6-4789-9abc-def012345678</GUID>
    <MASTERID>9001</MASTERID>
    <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
    <VOUCHERNUMBER>JNL/2024/001</VOUCHERNUMBER>
    <NARRATION>Month-end adjustment</NARRATION>
    <AMOUNT>1000.00</AMOUNT>
    <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>Cash</LEDGERNAME>
      <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
      <AMOUNT>1000.00</AMOUNT>
    </ALLLEDGERENTRIES.LIST>
    <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>Sales</LEDGERNAME>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
      <AMOUNT>-1000.00</AMOUNT>
    </ALLLEDGERENTRIES.LIST>
  </VOUCHER>
</COLLECTION></DATA></BODY></ENVELOPE>`

const PAYMENT_VOUCHER_XML = `<ENVELOPE><BODY><DATA><COLLECTION>
  <VOUCHER REMOTEID="r3" VCHKEY="k3" VCHTYPE="Payment" ACTION="Create">
    <DATE>2024-01-15</DATE>
    <GUID>f1e2d3c4-b5a6-4978-8def-0123456789ab</GUID>
    <MASTERID>7042</MASTERID>
    <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
    <VOUCHERNUMBER>JV-2024-001</VOUCHERNUMBER>
    <PARTYLEDGERNAME>Vendor ABC</PARTYLEDGERNAME>
    <NARRATION>Payment for services</NARRATION>
    <AMOUNT>-75000.00</AMOUNT>
  </VOUCHER>
</COLLECTION></DATA></BODY></ENVELOPE>`

const EMPTY_XML = '<ENVELOPE><BODY><DATA><COLLECTION></COLLECTION></DATA></BODY></ENVELOPE>'

describe('TallyPrimeAdapter bills (Purchase vouchers)', () => {
  it('listBills sends the documented Export/Collection Type=Voucher request, not invoice\'s Voucher Register request', async () => {
    const post = mockResponse(PURCHASE_VOUCHER_XML)
    const adapter = new TallyPrimeAdapter()
    await adapter.listBills(CREDENTIALS, {})

    expect(post).toHaveBeenCalledWith('https://tally.example.com/xml', expect.any(String), expect.anything())
    const body = postedBody(post)
    expect(body).toContain('<TALLYREQUEST>Export</TALLYREQUEST>')
    expect(body).toContain('<TYPE>Collection</TYPE>')
    expect(body).toContain('<TYPE>Voucher</TYPE>')
    expect(body).toContain('VoucherTypeName = "Purchase"')
    expect(body).toContain('<SVFROMDATE')
    expect(body).toContain('<SVTODATE')
    expect(body).toContain('ALLLEDGERENTRIES.LIST')
    // Not invoice's undocumented request shape.
    expect(body).not.toContain('Voucher Register')
    expect(body).not.toContain('SVVOUCHERTYPE')
  })

  it('listBills parses the voucher into a Bill via GUID', async () => {
    mockResponse(PURCHASE_VOUCHER_XML)
    const adapter = new TallyPrimeAdapter()
    const bills = await adapter.listBills(CREDENTIALS, {})

    expect(bills).toHaveLength(1)
    expect(bills[0]?.id).toBe('84f4d69e-1a2b-4c3d-9e0f-1234567890ab')
    expect(bills[0]?.billNumber).toBe('PUR/2024/001')
    expect(bills[0]?.contactId).toBe('Supplier Co')
    expect(bills[0]?.totalAmount).toBe(-5000)
  })

  it('listBills passes updatedAfter through as SVFROMDATE (YYYYMMDD)', async () => {
    const post = mockResponse(EMPTY_XML)
    const adapter = new TallyPrimeAdapter()
    await adapter.listBills(CREDENTIALS, { updatedAfter: new Date(Date.UTC(2026, 0, 5)) })

    const body = postedBody(post)
    expect(body).toContain('<SVFROMDATE TYPE="Date">20260105</SVFROMDATE>')
  })

  it('getBill filters by GUID/MASTERID, not VOUCHERNUMBER', async () => {
    const post = mockResponse(PURCHASE_VOUCHER_XML)
    const adapter = new TallyPrimeAdapter()
    const bill = await adapter.getBill(CREDENTIALS, '84f4d69e-1a2b-4c3d-9e0f-1234567890ab')

    const body = postedBody(post)
    expect(body).toContain('$Guid = "84f4d69e-1a2b-4c3d-9e0f-1234567890ab"')
    expect(body).toContain('$MasterId = "84f4d69e-1a2b-4c3d-9e0f-1234567890ab"')
    expect(body).toContain('VoucherTypeName = "Purchase"')
    expect(body).not.toContain('<VOUCHERNUMBER>84f4d69e')
    expect(bill.id).toBe('84f4d69e-1a2b-4c3d-9e0f-1234567890ab')
  })

  it('getBill throws a 404-mapped error when no voucher matches', async () => {
    mockResponse(EMPTY_XML)
    const adapter = new TallyPrimeAdapter()
    await expect(adapter.getBill(CREDENTIALS, 'missing-guid')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('TallyPrimeAdapter journals (Journal vouchers)', () => {
  it('listJournals filters on VoucherTypeName = Journal and parses ALLLEDGERENTRIES.LIST into lineItems', async () => {
    const post = mockResponse(JOURNAL_VOUCHER_XML)
    const adapter = new TallyPrimeAdapter()
    const journals = await adapter.listJournals(CREDENTIALS, {})

    const body = postedBody(post)
    expect(body).toContain('VoucherTypeName = "Journal"')

    expect(journals).toHaveLength(1)
    expect(journals[0]?.id).toBe('a1b2c3d4-e5f6-4789-9abc-def012345678')
    expect(journals[0]?.reference).toBe('JNL/2024/001')
    expect(journals[0]?.lineItems).toHaveLength(2)
    expect(journals[0]?.lineItems?.[0]).toMatchObject({ accountId: 'Cash', debitAmount: 1000 })
    expect(journals[0]?.lineItems?.[1]).toMatchObject({ accountId: 'Sales', creditAmount: 1000 })
  })

  it('getJournal filters by GUID/MASTERID and VoucherTypeName = Journal', async () => {
    const post = mockResponse(JOURNAL_VOUCHER_XML)
    const adapter = new TallyPrimeAdapter()
    const journal = await adapter.getJournal(CREDENTIALS, 'a1b2c3d4-e5f6-4789-9abc-def012345678')

    const body = postedBody(post)
    expect(body).toContain('$Guid = "a1b2c3d4-e5f6-4789-9abc-def012345678"')
    expect(body).toContain('VoucherTypeName = "Journal"')
    expect(journal.lineItems).toHaveLength(2)
  })

  it('getJournal throws a 404-mapped error when no voucher matches', async () => {
    mockResponse(EMPTY_XML)
    const adapter = new TallyPrimeAdapter()
    await expect(adapter.getJournal(CREDENTIALS, 'missing-guid')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('TallyPrimeAdapter transactions (Receipt, Payment, Contra vouchers)', () => {
  it('listTransactions filters on all three voucher types', async () => {
    const post = mockResponse(PAYMENT_VOUCHER_XML)
    const adapter = new TallyPrimeAdapter()
    const transactions = await adapter.listTransactions(CREDENTIALS, {})

    const body = postedBody(post)
    expect(body).toContain('VoucherTypeName = "Receipt"')
    expect(body).toContain('VoucherTypeName = "Payment"')
    expect(body).toContain('VoucherTypeName = "Contra"')

    expect(transactions).toHaveLength(1)
    expect(transactions[0]?.id).toBe('f1e2d3c4-b5a6-4978-8def-0123456789ab')
    expect(transactions[0]?.type).toBe('Payment')
    expect(transactions[0]?.reference).toBe('JV-2024-001')
    expect(transactions[0]?.totalAmount).toBe(-75000)
  })

  it('getTransaction filters by GUID/MASTERID across Receipt/Payment/Contra', async () => {
    const post = mockResponse(PAYMENT_VOUCHER_XML)
    const adapter = new TallyPrimeAdapter()
    const txn = await adapter.getTransaction(CREDENTIALS, 'f1e2d3c4-b5a6-4978-8def-0123456789ab')

    const body = postedBody(post)
    expect(body).toContain('$Guid = "f1e2d3c4-b5a6-4978-8def-0123456789ab"')
    expect(body).toContain('VoucherTypeName = "Payment"')
    expect(txn.id).toBe('f1e2d3c4-b5a6-4978-8def-0123456789ab')
  })

  it('getTransaction throws a 404-mapped error when no voucher matches', async () => {
    mockResponse(EMPTY_XML)
    const adapter = new TallyPrimeAdapter()
    await expect(adapter.getTransaction(CREDENTIALS, 'missing-guid')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})
