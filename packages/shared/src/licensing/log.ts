import { COMMUNITY_ENTITLEMENTS } from './community'
import { MAX_LICENSE_FILE_BYTES, TOKEN_AS_FILE_PATH } from './source'
import { DAY_MS, GRACE_PERIOD_MS } from './time'
import type { LicenseLimits, LicenseStatus } from './types'
import { LICENSE_RENEWAL_URL, LICENSE_SIGNUP_URL } from './urls'

export interface LicenseLogLine {
  level: 'info' | 'warn' | 'error'
  message: string
  fields: { license: Record<string, unknown> }
}

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`
/** Whole days are floored, so 0 means some of the last day remains: never print "0 days left". */
const daysLeft = (n: number): string =>
  n < 1 ? 'less than a day left' : `${plural(n, 'day')} left`
const defined = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
const communityMode = (l: LicenseLimits): string =>
  `community mode (${plural(l.connections, 'connection')}, ${plural(l.tenants, 'tenant')})`

function invalidHead(s: LicenseStatus, who: string): string {
  const path = s.filePath ?? 'the license file'
  switch (s.reason) {
    case 'FILE_UNREADABLE':
      if (s.filePath === TOKEN_AS_FILE_PATH) {
        return 'license INVALID (FILE_UNREADABLE): OPENSTEWARD_LICENSE_FILE holds a license token, not a path: put it in OPENSTEWARD_LICENSE instead.'
      }
      return `license INVALID (FILE_UNREADABLE): cannot read ${path}. The license file must be readable by uid 1000; mount the directory that holds it, not the single file.`
    case 'FILE_TOO_LARGE':
      return `license INVALID (FILE_TOO_LARGE): ${path} is over ${MAX_LICENSE_FILE_BYTES / 1024} KiB, so it is not a license file.`
    case 'FILE_EMPTY':
      return `license INVALID (FILE_EMPTY): ${path} is empty.`
    case 'DEV_KEY_ENV_MISMATCH':
      return `license INVALID (DEV_KEY_ENV_MISMATCH):${who}. It is signed with the development key ${s.kid ?? '?'}, which only signs env "dev" licenses, but it claims env "${s.env ?? '?'}".`
    case 'REVOKED':
      return `license INVALID (REVOKED):${who}. This license has been revoked.`
    case 'NOT_YET_VALID':
      return `license INVALID (NOT_YET_VALID): it is not valid yet; check this machine's clock.`
    default:
      return `license INVALID (${s.reason ?? 'UNKNOWN'})${s.source === 'file' ? `: ${path}` : s.source === 'env' ? ': from OPENSTEWARD_LICENSE' : ''}.`
  }
}

/**
 * The startup, on-change and daily-reminder line. Built from the status only,
 * which carries no token (handover §5.8). Log `.message` at `.level`, with
 * `.fields` as structured context.
 */
export function formatLicenseLogLine(s: LicenseStatus): LicenseLogLine {
  // Display only. Truthiness, not `.tier !==`: A3.4's tier-branch rule flags comparisons on tier.
  const who = [
    s.org ? ` org="${s.org}"` : '',
    s.label ? ` label="${s.label}"` : '',
    s.tier ? ` tier=${s.tier}` : '',
    s.licenseId ? ` id=${s.licenseId}` : '',
  ].join('')
  const day = s.expiresAt?.slice(0, 10) ?? '?'
  const days = s.daysRemaining ?? 0
  // MISSING/INVALID/DEGRADED already carry the community limits; GRACE still
  // carries the license's, so "drops to" names the community limits explicitly.
  const community = communityMode(
    s.entitlementSource === 'community' ? s.limits : COMMUNITY_ENTITLEMENTS.limits,
  )
  const fields = {
    license: defined({
      state: s.state,
      reason: s.reason,
      source: s.source,
      filePath: s.filePath,
      shadowedFile: s.shadowedFile,
      entitlementSource: s.entitlementSource,
      limits: s.limits,
      licenseId: s.licenseId,
      org: s.org,
      tier: s.tier,
      label: s.label,
      env: s.env,
      kid: s.kid,
      expiresAt: s.expiresAt,
      daysRemaining: s.daysRemaining,
      clockRollbackDetected: s.clockRollbackDetected,
      revocationList: s.revocationList,
    }),
  }
  switch (s.state) {
    case 'VALID':
      return {
        level: 'info',
        message: `license VALID:${who}; expires ${day} (${daysLeft(days)})`,
        fields,
      }
    case 'EXPIRING':
      return {
        level: 'warn',
        message: `license EXPIRING:${who}; expires ${day} (${daysLeft(days)}). Renew at ${LICENSE_RENEWAL_URL}`,
        fields,
      }
    case 'GRACE': {
      const left = Math.max(0, GRACE_PERIOD_MS / DAY_MS + days)
      return {
        level: 'error',
        message: `license EXPIRED on ${day}:${who}. Grace period: ${daysLeft(left)}, then this deployment drops to ${community}. Renew now at ${LICENSE_RENEWAL_URL}`,
        fields,
      }
    }
    case 'DEGRADED':
      return {
        level: 'error',
        message: `license EXPIRED on ${day} and its 30-day grace period has ended:${who}. Running in ${community}; existing connections stay readable and nothing is deleted. Renew at ${LICENSE_RENEWAL_URL}`,
        fields,
      }
    case 'INVALID':
      return {
        level: 'error',
        message: `${invalidHead(s, who)} Running in ${community}. Get a valid license at ${LICENSE_RENEWAL_URL}`,
        fields,
      }
    case 'MISSING':
      return {
        level: 'warn',
        message: `no license found (OPENSTEWARD_LICENSE is unset and ${s.filePath ?? 'the license file'} does not exist). Running in ${community}. Get a free license at ${LICENSE_SIGNUP_URL}`,
        fields,
      }
  }
}
