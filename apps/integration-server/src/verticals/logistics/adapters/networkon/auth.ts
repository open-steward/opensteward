import type { Credentials } from '../../adapter/interface'
import { NETWORKON_DASHBOARD_URL } from './constants'

export function buildAuthUrl(_state: string): string { return NETWORKON_DASHBOARD_URL }
export async function exchangeApiKey(apiKey: string): Promise<Credentials> { return { accessToken: apiKey } }
export async function refreshCredentials(c: Credentials): Promise<Credentials> { return c }
