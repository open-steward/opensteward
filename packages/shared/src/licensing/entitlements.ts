import { VERTICALS } from '@opensteward/license-token'
import type { LicenseLimitKey, LicenseStatus } from './types'

/** The ONE gating API (handover §5.5). Branch on features and limits only, never on tier. */
export class EntitlementService {
  private readonly granted: ReadonlySet<string>
  constructor(private readonly current: LicenseStatus) {
    this.granted = new Set(current.features)
  }
  has(feature: string): boolean {
    return this.granted.has(feature)
  }
  limit(key: LicenseLimitKey): number {
    return this.current.limits[key]
  }
  verticals(): string[] {
    return VERTICALS.filter((v) => this.granted.has(`vertical:${v}`))
  }
  status(): LicenseStatus {
    return this.current
  }
}
