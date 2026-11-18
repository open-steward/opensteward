import type { Company } from '../../../schema/company'

/**
 * Streak has no dedicated company resource — company names are embedded in
 * contacts. This module is provided for interface completeness; the adapter
 * returns 501 for all company methods.
 */
export interface RawStreakCompany {
  [key: string]: unknown
}

 
export function transformCompany(_raw: RawStreakCompany): Company {
  throw new Error('Streak does not support a dedicated company resource')
}
