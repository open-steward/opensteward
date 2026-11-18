import type { Credentials } from '../../adapter/interface'

// e-conomic uses two long-lived tokens: X-AppSecretToken + X-AgreementGrantToken.
// No OAuth2. The "code" is formatted as "appSecretToken:agreementGrantToken".

export function buildAuthUrl(_state: string): string {
  return 'https://secure.e-conomic.com/secure/api1/requestaccess.aspx'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  const colonIdx = code.indexOf(':')
  if (colonIdx === -1) {
    throw new Error('e-conomic code must be "appSecretToken:agreementGrantToken"')
  }
  const appSecretToken = code.slice(0, colonIdx)
  const agreementGrantToken = code.slice(colonIdx + 1)
  return {
    accessToken: agreementGrantToken,
    extra: { appSecretToken },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Tokens don't expire — return as-is
  return credentials
}
