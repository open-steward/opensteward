export const HOSTS = {
  sandbox: 'https://sandbox.affirm.com',
  live: 'https://api.affirm.com',
} as const

export type AffirmEnvironment = keyof typeof HOSTS
export const DEFAULT_ENVIRONMENT: AffirmEnvironment = 'sandbox'
