import { describe, it, expect, vi, afterEach } from 'vitest'
import { TallyPrimeAdapter } from '../../../../../../src/verticals/accounting/adapters/tallyprime'
import { TallyClient } from '../../../../../../src/verticals/accounting/adapters/tallyprime/client'
import type { Credentials } from '@opensteward/shared'

/**
 * There are three unverified assumptions about TallyPrime's Voucher
 * Collection export. Two of them have silent failure modes, so both are now
 * handled without depending on which is true:
 *
 *   DATE format — Tally documents `YYYYMMDD`, which `new Date()` cannot parse.
 *                 Resolved from the vendor's own docs; see transform/shared.ts.
 *   GUID / MASTERID position — element vs attribute on the `<VOUCHER>` tag is
 *                 still unconfirmed, so both positions are read.
 *
 * The third (whether `FETCH` is required) has no silent failure mode: if the
 * field list is wrong the fields simply come back absent, which is visible.
 */

const CREDS = { accessToken: 'x', extra: { baseUrl: 'http://tally.local:9000' } } as Credentials

function adapter(): TallyPrimeAdapter {
  return new TallyPrimeAdapter()
}

function stub(xml: string) {
  return vi.spyOn(TallyClient.prototype, 'request').mockResolvedValue(xml as never)
}

const ELEMENT_FORM = `
<ENVELOPE><BODY><DATA><COLLECTION>
  <VOUCHER>
    <GUID>abc-123</GUID>
    <MASTERID>42</MASTERID>
    <VOUCHERNUMBER>PUR-1</VOUCHERNUMBER>
    <DATE>20260915</DATE>
    <AMOUNT>1250.00</AMOUNT>
  </VOUCHER>
</COLLECTION></DATA></BODY></ENVELOPE>`

const ATTRIBUTE_FORM = `
<ENVELOPE><BODY><DATA><COLLECTION>
  <VOUCHER GUID="abc-123" MASTERID="42" VCHTYPE="Purchase">
    <VOUCHERNUMBER>PUR-1</VOUCHERNUMBER>
    <DATE>20260915</DATE>
    <AMOUNT>1250.00</AMOUNT>
  </VOUCHER>
</COLLECTION></DATA></BODY></ENVELOPE>`

afterEach(() => vi.restoreAllMocks())

describe('tallyprime voucher parsing', () => {
  it('reads GUID and MASTERID as child elements', async () => {
    stub(ELEMENT_FORM)
    const [bill] = await adapter().listBills(CREDS, {})
    expect(bill?.id).toBe('abc-123')
  })

  it('reads them as attributes on the VOUCHER tag too', async () => {
    // The position flagged as unverified. Whichever Tally emits, the id is
    // found rather than silently becoming an empty string.
    stub(ATTRIBUTE_FORM)
    const [bill] = await adapter().listBills(CREDS, {})
    expect(bill?.id).toBe('abc-123')
  })

  it('keeps the element value when both positions are present', async () => {
    stub(`<VOUCHER GUID="from-attribute"><GUID>from-element</GUID><DATE>20260915</DATE><AMOUNT>1</AMOUNT></VOUCHER>`)
    const [bill] = await adapter().listBills(CREDS, {})
    expect(bill?.id).toBe('from-element')
  })

  it('parses the documented date form in either voucher shape', async () => {
    stub(ATTRIBUTE_FORM)
    const [bill] = await adapter().listBills(CREDS, {})
    expect(bill?.postedAt).toEqual(new Date('2026-09-15T00:00:00.000Z'))
  })
})
