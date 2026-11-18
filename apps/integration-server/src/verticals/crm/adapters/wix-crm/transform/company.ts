import type { Company } from '../../../schema/company'

/** Wix CRM v3 has no separate company concept. This transform is a stub. */
export function transformCompany(_raw: unknown): Company {
  throw new Error('not implemented')
}
