/**
 * The License card and alert on the System page, and the admin-only banner
 * (pure; routes/settings.ts and server.ts render them).
 *
 * Everything comes from admin-api's GET /api/license answer — the renewal URL and
 * the end of the grace period included — so the console holds no licensing
 * constants of its own and cannot disagree with integration-server, the single
 * license authority. The one shared constant is the token contract's "Unlimited"
 * display threshold (isUnlimitedLimit), which the license service uses too.
 * Display only: nothing here gates anything, and the plan (`tier`) is shown as
 * it comes, never branched on.
 */
import { isUnlimitedLimit } from '@opensteward/shared/licensing'
import type { LicenseStatusRecord } from './proxy/admin-api-client'

export type LicenseTone = 'success' | 'warning' | 'danger'

export interface LicenseAlert {
  state: LicenseStatusRecord['state']
  tone: 'warning' | 'danger'
  title: string
  detail: string
  href: string
  linkText: string
}

export interface LicenseCard {
  state: LicenseStatusRecord['state']
  label: string
  tone: LicenseTone
  rows: Array<{ label: string; value: string }>
  verticals: string[]
  notes: string[]
  href: string
  linkText: string
}

const day = (iso: string | undefined): string | null =>
  iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Community mode in one paragraph: the limits, and what happens above them — the
 * master plan's copy for P6 ("Connections beyond the first N stay readable and keep
 * syncing; writes through them are refused (LICENSE_LIMIT_EXCEEDED). Nothing is
 * deleted."). "The first N" are the oldest by creation time.
 */
export function communityNote(s: LicenseStatusRecord): string {
  const n = s.limits.connections
  return (
    `Running in community mode: ${plural(n, 'connection')} and ${plural(s.limits.tenants, 'tenant')}. ` +
    `Connections beyond the first ${n === 1 ? 'one' : n} stay readable and keep syncing; ` +
    'writes through them are refused (LICENSE_LIMIT_EXCEEDED). Nothing is deleted.'
  )
}

/** The alert for a license that needs attention; null when there is nothing to say. */
export function licenseAlert(s: LicenseStatusRecord | null): LicenseAlert | null {
  if (!s) return null
  const href = s.renewalUrl
  const exp = day(s.expiresAt)
  const on = exp ? ` on ${exp}` : ''
  switch (s.state) {
    case 'VALID':
      return null
    case 'EXPIRING':
      return {
        state: s.state,
        tone: 'warning',
        href,
        linkText: 'Renew the license',
        title: `The license expires in ${plural(Math.max(0, s.daysRemaining ?? 0), 'day')}${exp ? `, on ${exp}` : ''}.`,
        detail: 'An active subscription renews it: install the new license file when it arrives.',
      }
    case 'GRACE': {
      const end = day(s.graceEndsAt)
      return {
        state: s.state,
        tone: 'danger',
        href,
        linkText: 'Renew the license',
        title: `The license expired${on}.`,
        detail: `Everything keeps working${end ? ` until ${end}` : ' for the 30-day grace period'}; after that the deployment runs in community mode.`,
      }
    }
    case 'DEGRADED':
      return {
        state: s.state,
        tone: 'danger',
        href,
        linkText: 'Renew the license',
        title: `The license expired${on} and its grace period is over.`,
        detail: communityNote(s),
      }
    case 'INVALID':
      return {
        state: s.state,
        tone: 'danger',
        href,
        linkText: 'Get a license',
        title: `The installed license is not valid${s.reason ? ` (${s.reason})` : ''}.`,
        detail: communityNote(s),
      }
    case 'MISSING':
      return {
        state: s.state,
        tone: 'warning',
        href,
        linkText: 'Get a free license',
        title: 'No license is installed.',
        detail: communityNote(s),
      }
    default:
      // A state a newer integration-server added: the card shows it; no alert is invented.
      return null
  }
}

const CARD: Record<
  LicenseStatusRecord['state'],
  { label: string; tone: LicenseTone; linkText: string }
> = {
  VALID: { label: 'Valid', tone: 'success', linkText: 'Manage your license' },
  EXPIRING: { label: 'Expiring soon', tone: 'warning', linkText: 'Renew the license' },
  GRACE: { label: 'Expired: grace period', tone: 'danger', linkText: 'Renew the license' },
  DEGRADED: { label: 'Expired: community mode', tone: 'danger', linkText: 'Renew the license' },
  INVALID: { label: 'Invalid: community mode', tone: 'danger', linkText: 'Get a license' },
  MISSING: {
    label: 'Not installed: community mode',
    tone: 'warning',
    linkText: 'Get a free license',
  },
}

function readFrom(s: LicenseStatusRecord): string {
  if (s.source === 'env') return 'OPENSTEWARD_LICENSE (environment variable)'
  if (s.source === 'file') return s.filePath ?? 'a license file'
  return s.filePath ? `nothing at ${s.filePath}` : 'no license file'
}

/** The License card on the System page. */
export function describeLicense(s: LicenseStatusRecord): LicenseCard {
  // A state a newer integration-server added is shown as it comes, never hidden.
  const look = Object.prototype.hasOwnProperty.call(CARD, s.state)
    ? CARD[s.state]
    : { label: String(s.state), tone: 'warning' as const, linkText: 'Get a license' }
  const rows: LicenseCard['rows'] = []
  if (s.org) rows.push({ label: 'Licensed to', value: s.org })
  if (s.tier) rows.push({ label: 'Plan', value: s.tier })
  if (s.label) rows.push({ label: 'Label', value: s.label })
  if (s.licenseId) rows.push({ label: 'License ID', value: s.licenseId })
  const exp = day(s.expiresAt)
  if (exp) {
    const left =
      s.daysRemaining !== undefined && s.daysRemaining >= 0
        ? ` (${plural(s.daysRemaining, 'day')} left)`
        : ''
    rows.push({ label: 'Expires', value: exp + left })
  }
  const used = s.usage.connections
  const connections = isUnlimitedLimit(s.limits.connections)
    ? used === null
      ? 'Unlimited'
      : `Unlimited (${used} in use)`
    : used === null
      ? `up to ${s.limits.connections}`
      : `${used} of ${s.limits.connections}`
  rows.push({ label: 'Connections', value: connections })
  rows.push({
    label: 'Tenants',
    value: isUnlimitedLimit(s.limits.tenants)
      ? `Unlimited (${s.usage.tenants} registered, counting 'default')`
      : `${s.usage.tenants} of ${s.limits.tenants}, counting 'default'`,
  })
  rows.push({ label: 'Read from', value: readFrom(s) })

  const notes: string[] = []
  if (s.source === 'env' && s.shadowedFile) {
    notes.push(
      `OPENSTEWARD_LICENSE is set, so the license file ${s.shadowedFile} is ignored: renewing that file changes nothing until OPENSTEWARD_LICENSE is unset.`,
    )
  }
  if (s.entitlementSource === 'community') notes.push(communityNote(s))
  if (s.env === 'dev') notes.push('Development license: production builds refuse it.')
  if (s.clockRollbackDetected) {
    notes.push(
      "The server clock is behind the latest time licensing has seen, so licensing uses that time. Check the host's time sync; the license guide explains how to recover from a clock that was once set too far ahead.",
    )
  }
  // Everything else is still checked; only revocation is not, so say exactly that.
  if (s.revocationList === 'missing') {
    notes.push(
      'This build carries no license revocation list, so revoked licenses cannot be detected. Upgrade to a current release.',
    )
  }
  if (s.revocationList === 'invalid') {
    notes.push(
      "This build's license revocation list did not verify, so revoked licenses cannot be detected. Upgrade to a current release.",
    )
  }
  if (s.stale) {
    notes.push(
      `Last known status, from ${s.fetchedAt.slice(0, 16).replace('T', ' ')} UTC: the integration server is not answering.`,
    )
  }
  return {
    state: s.state,
    label: look.label,
    tone: look.tone,
    rows,
    verticals: s.features
      .filter((f) => f.startsWith('vertical:'))
      .map((f) => f.slice('vertical:'.length)),
    notes,
    href: s.renewalUrl,
    linkText: look.linkText,
  }
}
