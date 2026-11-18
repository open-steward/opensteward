/**
 * Creatio has no standalone Note object to list or read: notes are a `Notes`
 * text column on the section record itself.
 *
 * https://academy.creatio.com/guides/creatio-apps/8.0/platform-basics/user-interface/attachments-and-notes
 *   "The Notes detail is used to store additional text information about the
 *    section record."
 *
 * Creatio's own OData 4 Postman collection (linked from the OData 4 reference)
 * shows a stock instance's Contact relations — ActivityCollectionByContact,
 * OpportunityCollectionByContact, ContactFileCollectionByContact and 74 more —
 * and none is a Note object; notes appear only as `<d:Notes>` on the records.
 * So listNotes and getNote refuse before sending anything.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink } from '@opensteward/shared'
import { CreatioAdapter } from '../../../../../../src/verticals/crm/adapters/creatio/index'

const CREDS = { accessToken: 'tok', extra: { instanceUrl: 'https://acme.creatio.com' } }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('creatio notes', () => {
  it('listNotes throws 501 NOT_SUPPORTED and sends no request', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ value: [{ Id: 'n1', Notes: 'x' }] }), { status: 200 }),
      )
    await expect(
      new CreatioAdapter().listNotes(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('getNote throws 501 NOT_SUPPORTED and sends no request', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ Id: 'n1', Notes: 'x' }), { status: 200 }))
    await expect(new CreatioAdapter().getNote(CREDS, 'n1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
