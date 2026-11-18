export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (v == null || v === '') return undefined
  return String(v)
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'object') continue
    out[k] = String(v)
  }
  return out
}

const OTOBO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/

/**
 * OTOBO date-times ('2010-10-27 20:15:00' in TicketGet.pm) carry no zone.
 * They are stored in the OTOBOTimeZone SysConfig setting, whose shipped
 * default is UTC (Kernel/Config/Files/XML/Framework.xml: "Sets the time zone
 * being used internally by OTOBO to e. g. store dates and times in the
 * database", <Item ValueType="TimeZone">UTC</Item>). A value that is not in
 * that exact shape is not guessed at.
 */
export function parseOtoboDateTime(s: unknown): string | undefined {
  if (typeof s !== 'string') return undefined
  const m = OTOBO_DATE_TIME.exec(s)
  if (!m) return undefined
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}
