import type { Credentials } from '../../adapter/interface'
import { SZAMLAZZHU_SETTINGS_URL } from './constants'

// Számlázz.hu uses Agent Key authentication embedded in XML request bodies.
// There is no OAuth flow. The "code" passed to exchangeCode is the Agent Key itself.

export function buildAuthUrl(_state: string): string {
  // Direct user to the Számlázz.hu dashboard to obtain their Agent Key
  return SZAMLAZZHU_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  // code is the Számla Agent Key (szamlaagentkulcs)
  return { accessToken: code }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Agent Keys do not expire; simply return credentials unchanged
  return credentials
}
