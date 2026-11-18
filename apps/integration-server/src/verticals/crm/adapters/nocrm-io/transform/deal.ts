/**
 * noCRM.io Lead → canonical Deal transform.
 *
 * In noCRM.io the primary sales object is a "lead". Leads map to canonical
 * Deals. Re-exports from lead.ts for consumers that import from deal.ts.
 */

export {
  transformLead as transformDeal,
  untransformLead as untransformDeal,
  type RawNocrmLead as RawNocrmDeal,
} from './lead'
