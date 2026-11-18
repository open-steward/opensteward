/**
 * Parcelhub request shape, refusals and auth.
 *
 * The adapter used to call https://api.parcelhub.co.uk/v3/ (no DNS record) with
 * a static API key as the bearer token. First-party docs, https://api.parcelhub.net/docs/ :
 *   Shipping API servers https://api.parcelhub.net; POST /1.0/TokenV2 (username +
 *   password → access_token, refreshToken); GET /1.0/Shipment/{id}; GET /Shipment
 *   (List Shipments, only `AccountId`, ShipmentSummary rows with no label fields).
 *   Tracking API server https://trackapi.parcelhub.net; POST
 *   /v1/trackingservice/gettrackinghistory with AccountID/AccessCode in the body.
 *
 * The fakes answer only those documented paths.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { ParcelHubAdapter } from '../../../../../../src/verticals/logistics/adapters/parcelhub/index'
import { LabelSchema } from '../../../../../../src/verticals/logistics/schema/label'
import { TrackingEventSchema } from '../../../../../../src/verticals/logistics/schema/trackingevent'
import { GET_SHIPMENT_XML, TOKEN_XML, TRACKING_HISTORY_XML } from './fixtures'

const TOKEN_URL = 'https://api.parcelhub.net/1.0/TokenV2'
const HISTORY_URL = 'https://trackapi.parcelhub.net/v1/trackingservice/gettrackinghistory'

type Sent = { method: string; url: string; body?: unknown; headers: Record<string, unknown> }

function fakeHttp(answers: { tokenXml?: string; historyXml?: string } = {}) {
  const sent: Sent[] = []
  const instanceGet = vi.fn()
  const createSpy = vi.spyOn(axios, 'create').mockImplementation(((cfg: {
    baseURL: string
    headers: Record<string, string>
  }) => {
    instanceGet.mockImplementation(
      async (path: string, opts: { headers?: Record<string, string> }) => {
        const url = `${cfg.baseURL}${path}`
        sent.push({ method: 'GET', url, headers: { ...cfg.headers, ...opts?.headers } })
        const m = /^https:\/\/api\.parcelhub\.net\/1\.0\/Shipment\/(\d+)$/.exec(url)
        if (!m) throw new Error(`404: undocumented ${url}`)
        return { data: GET_SHIPMENT_XML.replace(/2815849279065972/g, m[1] as string) }
      },
    )
    return { get: instanceGet, post: vi.fn() }
  }) as never)
  const postSpy = vi.spyOn(axios, 'post').mockImplementation((async (
    url: string,
    body: unknown,
    opts: { headers?: Record<string, string> },
  ) => {
    sent.push({ method: 'POST', url, body, headers: { ...opts?.headers } })
    if (url === TOKEN_URL) return { data: answers.tokenXml ?? TOKEN_XML }
    if (url === HISTORY_URL) return { data: answers.historyXml ?? TRACKING_HISTORY_XML }
    throw new Error(`404: undocumented ${url}`)
  }) as never)
  const getSpy = vi.spyOn(axios, 'get').mockImplementation((async (url: string) => {
    sent.push({ method: 'GET', url, headers: {} })
    throw new Error(`unexpected GET ${url}`)
  }) as never)
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (url: string) => {
    sent.push({ method: 'FETCH', url: String(url), headers: {} })
    throw new Error(`unexpected fetch ${String(url)}`)
  }) as never)
  return { sent, createSpy, postSpy, getSpy, fetchSpy }
}

const CREDS = { accessToken: 'jwt-a', refreshToken: 'rt-a' }
const TRACK_CREDS = {
  ...CREDS,
  extra: { trackingAccountId: 'L100541', trackingAccessCode: 'f2e018a184b6463a85c0343e2df129a2' },
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ParcelHub listLabels', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const http = fakeHttp()
    const err = await new ParcelHubAdapter()
      .listLabels(CREDS, { page: 1, limit: 5 })
      .catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect((err as Error).message).toMatch(/Parcelhub cannot list labels/)
    expect(http.sent).toEqual([])
    expect(http.createSpy).not.toHaveBeenCalled()
  })
})

describe('ParcelHub getLabel', () => {
  it('GETs /1.0/Shipment/{id} on api.parcelhub.net with the bearer token, as XML', async () => {
    const http = fakeHttp()
    const label = await new ParcelHubAdapter().getLabel(CREDS, '12667473463631775')
    expect(http.sent).toHaveLength(1)
    expect(http.sent[0]).toMatchObject({
      method: 'GET',
      url: 'https://api.parcelhub.net/1.0/Shipment/12667473463631775',
    })
    expect(http.sent[0]?.headers.Authorization).toBe('bearer jwt-a')
    expect(http.sent[0]?.headers.Accept).toBe('application/xml')
    const parsed = LabelSchema.parse(label)
    expect(parsed.id).toBe('12667473463631775')
    expect(parsed.trackingNumber).toBe('JD0002200000002197')
  })
})

describe('ParcelHub getTrackingEvents', () => {
  it('refuses with 501 and sends nothing when the Tracking API credentials are missing', async () => {
    const http = fakeHttp()
    const err = await new ParcelHubAdapter()
      .getTrackingEvents(CREDS, 'L10054111000002661')
      .catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(http.sent).toEqual([])
  })

  it('refuses when only one of the two Tracking API credentials is present', async () => {
    const http = fakeHttp()
    const adapter = new ParcelHubAdapter()
    for (const extra of [{ trackingAccountId: 'L100541' }, { trackingAccessCode: 'code' }]) {
      const err = await adapter
        .getTrackingEvents({ ...CREDS, extra }, 'L10054111000002661')
        .catch((e: unknown) => e)
      expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    }
    expect(http.sent).toEqual([])
  })

  it('POSTs the documented GetTrackingHistoryRequest to trackapi.parcelhub.net', async () => {
    const http = fakeHttp()
    const events = await new ParcelHubAdapter().getTrackingEvents(TRACK_CREDS, 'L10054111000002661')
    expect(http.sent).toHaveLength(1)
    const req = http.sent[0] as Sent
    expect(req.url).toBe(HISTORY_URL)
    expect(req.headers['Content-Type']).toBe('application/xml')
    const body = String(req.body)
    expect(body).toContain('<GetTrackingHistoryRequest>')
    expect(body).toContain(
      '<Authentication><AccountID>L100541</AccountID><AccessCode>f2e018a184b6463a85c0343e2df129a2</AccessCode></Authentication>',
    )
    expect(body).toContain('<SearchType>ByTrackingNumber</SearchType>')
    expect(body).toContain('<SearchTerm>L10054111000002661</SearchTerm>')
    // The Tracking API takes its credentials in the body, not the Shipping API token.
    expect(req.headers.Authorization).toBeUndefined()
    expect(events.map((e) => TrackingEventSchema.parse(e).description)).toEqual([
      'Shipment Deleted',
      'Shipment Created',
    ])
  })

  it('throws the ServiceResult error instead of returning no events', async () => {
    const historyXml = TRACKING_HISTORY_XML.replace(
      '<Success>true</Success>',
      '<Success>false</Success>',
    )
      .replace('<ErrorCode>0</ErrorCode>', '<ErrorCode>12</ErrorCode>')
      .replace('<ErrorMessage />', '<ErrorMessage>Invalid access code</ErrorMessage>')
    fakeHttp({ historyXml })
    await expect(
      new ParcelHubAdapter().getTrackingEvents(TRACK_CREDS, 'L10054111000002661'),
    ).rejects.toThrow('Parcelhub Tracking API error 12: Invalid access code')
  })

  it('escapes the Tracking API credentials into the XML body', async () => {
    const http = fakeHttp()
    await new ParcelHubAdapter().getTrackingEvents(
      { ...CREDS, extra: { trackingAccountId: 'A&1', trackingAccessCode: 'c<d' } },
      'L10054111000002661',
    )
    expect(String(http.sent[0]?.body)).toContain(
      '<AccountID>A&amp;1</AccountID><AccessCode>c&lt;d</AccessCode>',
    )
  })

  it('escapes the tracking number into the XML body', async () => {
    const http = fakeHttp()
    await new ParcelHubAdapter().getTrackingEvents(TRACK_CREDS, 'A<B&C')
    expect(String(http.sent[0]?.body)).toContain('<SearchTerm>A&lt;B&amp;C</SearchTerm>')
  })
})

describe('ParcelHub auth', () => {
  it('exchanges the username and password at POST /1.0/TokenV2', async () => {
    const http = fakeHttp()
    const before = Date.now()
    const creds = await new ParcelHubAdapter().exchangeCredentials({
      username: 'TEST001',
      password: 'p<w',
      trackingAccountId: 'L100541',
      trackingAccessCode: 'code',
    })
    expect(http.sent).toHaveLength(1)
    const body = String(http.sent[0]?.body)
    expect(http.sent[0]?.url).toBe(TOKEN_URL)
    expect(http.sent[0]?.headers['Content-Type']).toBe('application/xml')
    expect(body).toContain('<RequestToken')
    expect(body).toContain('<grant_type>bearer</grant_type>')
    expect(body).toContain('<username>TEST001</username>')
    expect(body).toContain('<password>p&lt;w</password>')
    // The docs' example redacts both tokens as **REDACTED2**.
    expect(creds.accessToken).toBe('**REDACTED2**')
    expect(creds.refreshToken).toBe('**REDACTED2**')
    // "At the time of writing this is 4 hours."
    const ttl = (creds.expiresAt as Date).getTime() - before
    expect(ttl).toBeGreaterThanOrEqual(4 * 3600 * 1000 - 1000)
    expect(ttl).toBeLessThanOrEqual(4 * 3600 * 1000 + 1000)
    expect(creds.extra).toEqual({ trackingAccountId: 'L100541', trackingAccessCode: 'code' })
  })

  it('stores no tracking credentials when only one of the two is supplied', async () => {
    fakeHttp()
    const adapter = new ParcelHubAdapter()
    const partials: Array<Record<string, string>> = [
      { trackingAccountId: 'L100541' },
      { trackingAccessCode: 'code' },
    ]
    for (const partial of partials) {
      const creds = await adapter.exchangeCredentials({ username: 'u', password: 'p', ...partial })
      expect(creds.extra).toBeUndefined()
    }
  })

  it('rejects a TokenV2 response that carries no access_token', async () => {
    fakeHttp({ tokenXml: TOKEN_XML.replace(/<access_token>[^<]*<\/access_token>/, '') })
    await expect(
      new ParcelHubAdapter().exchangeCredentials({ username: 'u', password: 'p' }),
    ).rejects.toThrow(/no access_token/)
  })

  it('exchangeCode splits "username:password" on the first colon', async () => {
    const http = fakeHttp()
    await new ParcelHubAdapter().exchangeCode('TEST001:pa:ss', 'https://unused')
    const body = String(http.sent[0]?.body)
    expect(body).toContain('<username>TEST001</username>')
    expect(body).toContain('<password>pa:ss</password>')
  })

  it('omits tracking credentials that were not supplied', async () => {
    fakeHttp()
    const creds = await new ParcelHubAdapter().exchangeCredentials({ username: 'u', password: 'p' })
    expect(creds.extra).toBeUndefined()
  })

  it('requires a username and password before sending anything', async () => {
    const http = fakeHttp()
    await expect(new ParcelHubAdapter().exchangeCredentials({ username: 'u' })).rejects.toThrow(
      /password is required/,
    )
    expect(http.sent).toEqual([])
  })

  it('refreshes with grant_type refreshtoken, the refresh token as username and an empty password', async () => {
    const http = fakeHttp()
    const creds = await new ParcelHubAdapter().refreshCredentials(TRACK_CREDS)
    const body = String(http.sent[0]?.body)
    expect(http.sent[0]?.url).toBe(TOKEN_URL)
    expect(body).toContain('<grant_type>refreshtoken</grant_type>')
    expect(body).toContain('<username>rt-a</username>')
    expect(body).toContain('<password></password>')
    expect(creds.accessToken).toBe('**REDACTED2**')
    expect(creds.extra).toEqual(TRACK_CREDS.extra)
  })

  it('stores the refresh token the refresh response returns', async () => {
    fakeHttp({
      tokenXml: TOKEN_XML.replace(
        /<refreshToken>[^<]*<\/refreshToken>/,
        '<refreshToken>rt-b</refreshToken>',
      ),
    })
    const creds = await new ParcelHubAdapter().refreshCredentials(TRACK_CREDS)
    expect(creds.refreshToken).toBe('rt-b')
  })

  it('keeps the current refresh token when the refresh response carries none', async () => {
    fakeHttp({ tokenXml: TOKEN_XML.replace(/<refreshToken>[^<]*<\/refreshToken>/, '') })
    const creds = await new ParcelHubAdapter().refreshCredentials(TRACK_CREDS)
    expect(creds.refreshToken).toBe('rt-a')
  })

  it('cannot refresh without a refresh token', async () => {
    const http = fakeHttp()
    await expect(new ParcelHubAdapter().refreshCredentials({ accessToken: 'x' })).rejects.toThrow(
      /no refresh token/,
    )
    expect(http.sent).toEqual([])
  })
})
