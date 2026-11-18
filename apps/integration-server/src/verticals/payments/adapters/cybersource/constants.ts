export const HOSTS = {
  test: 'https://apitest.cybersource.com',
  live: 'https://api.cybersource.com',
} as const

export type CybersourceEnvironment = keyof typeof HOSTS
export const DEFAULT_ENVIRONMENT: CybersourceEnvironment = 'test'
