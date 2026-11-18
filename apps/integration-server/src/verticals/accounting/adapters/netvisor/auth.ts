import type { Credentials } from '../../adapter/interface'

// Netvisor uses partner + customer key authentication.
// The "code" is formatted as "customerId:partnerId:partnerKey".

export function buildAuthUrl(_state: string): string {
  return 'https://integration.netvisor.fi/sharedconnection'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  const parts = code.split(':')
  if (parts.length < 3) {
    throw new Error('Netvisor code must be "customerId:partnerId:partnerKey"')
  }
  return {
    accessToken: parts[2],
    extra: { customerId: parts[0], partnerId: parts[1] },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Netvisor partner keys don't expire
  return credentials
}
