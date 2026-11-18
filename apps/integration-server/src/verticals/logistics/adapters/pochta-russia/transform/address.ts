import type { Address } from '../../../schema/shared'

/**
 * The flat address fields of an отправление, as the Otpravka specification
 * documents them for GET /1.0/batch/{name}/shipment and GET /1.0/shipment/{id}
 * (https://otpravka.pochta.ru/static/views/specification/batches-get_info_about_orders_in_batch.html).
 * Addresses are `*-to` / `*-from` fields, not nested objects.
 */
export interface PochtaRussiaFlatAddress {
  /** "recipient-name - Строка Наименование получателя одной строкой (ФИО, наименование организации)" */
  'recipient-name'?: string | null
  /** "index-to - Целое число (Опционально) Почтовый индекс" */
  'index-to'?: number | null
  /** "place-to - Строка Населенный пункт" */
  'place-to'?: string | null
  /** "region-to - Строка Область, регион" */
  'region-to'?: string | null
  /** "street-to - Строка Часть адреса: Улица" */
  'street-to'?: string | null
  /** "house-to - Строка Часть адреса: Номер здания" */
  'house-to'?: string | null
  /** "room-to - Строка (Опционально) Часть здания: Номер помещения" */
  'room-to'?: string | null
  /** "sender-name - Строка (Опционально) Наименование отправителя одной строкой" */
  'sender-name'?: string | null
  /** "index-from - Строка (Опционально) Почтовый индекс отправителя" */
  'index-from'?: string | null
  /** "place-from - Строка Населенный пункт отправителя" */
  'place-from'?: string | null
  /** "region-from - Строка Область, регион отправителя" */
  'region-from'?: string | null
  /** "street-from - Строка Часть адреса: Улица отправителя" */
  'street-from'?: string | null
  /** "house-from - Строка Часть адреса: Номер здания отправителя" */
  'house-from'?: string | null
  /** "room-from - Строка (Опционально) Часть здания: Номер помещения отправителя" */
  'room-from'?: string | null
}

export function text(v: string | null | undefined): string | undefined {
  return v == null || v === '' ? undefined : v
}

function street(...parts: Array<string | null | undefined>): string | undefined {
  return parts.filter((p): p is string => !!p).join(', ') || undefined
}

function compact(a: Address): Address | undefined {
  const out = Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined)) as Address
  return Object.keys(out).length ? out : undefined
}

// `mail-direct` is a numeric country code (dictionary-countries), not an
// ISO 3166 alpha-2, so neither address sets a country.

/** The recipient's address from the documented `*-to` fields. */
export function destinationAddress(raw: PochtaRussiaFlatAddress): Address | undefined {
  return compact({
    name: text(raw['recipient-name']),
    street1: street(raw['street-to'], raw['house-to'], raw['room-to']),
    city: text(raw['place-to']),
    state: text(raw['region-to']),
    postalCode: raw['index-to'] != null ? String(raw['index-to']) : undefined,
  })
}

/** The sender's address from the documented `*-from` fields. */
export function originAddress(raw: PochtaRussiaFlatAddress): Address | undefined {
  return compact({
    name: text(raw['sender-name']),
    street1: street(raw['street-from'], raw['house-from'], raw['room-from']),
    city: text(raw['place-from']),
    state: text(raw['region-from']),
    postalCode: text(raw['index-from']),
  })
}
