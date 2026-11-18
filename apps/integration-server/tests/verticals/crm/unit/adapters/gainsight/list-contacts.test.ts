import { afterEach, describe, expect, it, vi } from 'vitest'
import { GainsightAdapter } from '../../../../../../src/verticals/crm/adapters/gainsight/index'
import { ContactSchema } from '../../../../../../src/verticals/crm/schema/contact'

/**
 * Gainsight's People API documents no list or query endpoint for Person
 * records, only single-record reads
 * (https://support.gainsight.com/gainsight_nxt/API_and_Developer_Docs/Person_API/People_API_Documentation):
 *
 *   "Get API allows you to get one record per API call from the Person, Company
 *    Person, and Relationship Person objects associated with a Person GSID passed
 *    in the Endpoint URL."
 *
 * The adapter used to POST an undocumented `/v1/peoplemgmt/v1.0/people/query`.
 * listContacts now refuses before sending anything.
 */

const creds = { accessToken: 'key', extra: { domain: 'acme' } }
const GSID = '1P04AB23JMJA97MWFYJM8PQO1KQTAYV5MXJ1'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('gainsight listContacts', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const fetchMock = vi.fn(async () => new Response('[]', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const err = await new GainsightAdapter().listContacts(creds, { page: 1, limit: 10 }).then(
      () => null,
      (e: unknown) => e as { statusCode?: number; code?: string; message: string },
    )

    expect(err).not.toBeNull()
    expect(err?.statusCode).toBe(501)
    expect(err?.code).toBe('NOT_SUPPORTED')
    expect(err?.message).toMatch(/Gainsight cannot list contacts/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads one contact by GSID through the documented Get Person API', async () => {
    // The documented sample success response (trimmed of relationships).
    const body = {
      result: true,
      requestId: 'b31b204c-6df8-444a-bfc7-d922a98bbebe',
      data: {
        email: 'jsmith@abc.com',
        createddate: '2018-06-05T12:03:16.417',
        firstname: 'John',
        modifieddate: '2018-06-05T12:03:16.417',
        name: 'John Smith',
        lastname: 'smith',
        location: 'United States',
        gsid: GSID,
        companies: [
          {
            company_id: { Id: '1P04QNK6ENCURXXDZW9WWWWWWWWWWTZCAAAA', name: 'abc, Inc.' },
            gsid: '1C01KDEEJ1EH9CQP5LE79JLEPK9AH63AKWS1',
            active: true,
            isprimarycompany: null,
            title: 'Executive Sponsor',
          },
        ],
      },
    }
    const fetchMock = vi.fn(async (input: string, init: RequestInit) => {
      expect(init.method).toBe('GET')
      expect(input).toBe(`https://personapi.gainsightcloud.com/v1/peoplemgmt/v1.0/people/${GSID}`)
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const contact = ContactSchema.parse(await new GainsightAdapter().getContact(creds, GSID))
    expect(contact.id).toBe(GSID)
    expect(contact.email).toBe('jsmith@abc.com')
    expect(contact.first_name).toBe('John')
    expect(contact.last_name).toBe('smith')
    expect(contact.company_id).toBe('1P04QNK6ENCURXXDZW9WWWWWWWWWWTZCAAAA')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports 404 on the documented empty failure response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              result: false,
              requestId: '9d4a874f-dd0e-4806-b91f-e1cf5405e371',
              data: {},
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    )
    await expect(new GainsightAdapter().getContact(creds, GSID)).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})
