import axios from 'axios'
import { ACCOUNTSIQ_API_HOST, ACCOUNTSIQ_API_PATH, ACCESS_TOKEN_TTL_MS } from './constants'
import type { Credentials } from '../../adapter/interface'

// AccountsIQ uses a SOAP API with OAuth2 Client Credentials flow (Integration_2_0).
// There is no browser-based authorization URL — credentials are exchanged server-side via SOAP.
// The API endpoint URL uses a regionCode stored in credentials.extra.regionCode.

export function buildAuthUrl(_state: string): string {
  // Not applicable — AccountsIQ does not use a browser OAuth2 redirect flow.
  return 'https://www.accountsiq.com'
}

function soapEnvelope(method: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:tns="https://app.accountsiq.com/">
  <soap:Body>
    <tns:${method}>${body}</tns:${method}>
  </soap:Body>
</soap:Envelope>`
}

function apiUrl(regionCode: string): string {
  return `https://${regionCode}.${ACCOUNTSIQ_API_HOST}${ACCOUNTSIQ_API_PATH}`
}

export async function exchangeCode(
  clientId: string,
  clientSecret: string,
  regionCode: string,
): Promise<Credentials> {
  const envelope = soapEnvelope(
    'TokenGet',
    `<tns:ClientId>${clientId}</tns:ClientId><tns:ClientSecret>${clientSecret}</tns:ClientSecret>`,
  )
  const { data } = await axios.post<string>(apiUrl(regionCode), envelope, {
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: 'https://app.accountsiq.com/TokenGet',
    },
  })
  // Parse AccessToken and RefreshToken from SOAP response XML
  const accessToken = (/<AccessToken>([^<]+)<\/AccessToken>/.exec(data) ?? [])[1] ?? ''
  const refreshToken = (/<RefreshToken>([^<]+)<\/RefreshToken>/.exec(data) ?? [])[1] ?? undefined
  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
    extra: { regionCode },
  }
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  regionCode: string,
): Promise<Credentials> {
  const envelope = soapEnvelope(
    'TokenRefresh',
    `<tns:ClientId>${clientId}</tns:ClientId><tns:ClientSecret>${clientSecret}</tns:ClientSecret><tns:RefreshToken>${refreshToken}</tns:RefreshToken>`,
  )
  const { data } = await axios.post<string>(apiUrl(regionCode), envelope, {
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: 'https://app.accountsiq.com/TokenRefresh',
    },
  })
  const accessToken = (/<AccessToken>([^<]+)<\/AccessToken>/.exec(data) ?? [])[1] ?? ''
  const newRefresh = (/<RefreshToken>([^<]+)<\/RefreshToken>/.exec(data) ?? [])[1] ?? refreshToken
  return {
    accessToken,
    refreshToken: newRefresh,
    expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
    extra: { regionCode },
  }
}
