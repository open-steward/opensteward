import type { Warehouse } from '../../../schema/warehouse'

/**
 * One pickup point (ПВЗ) from `ListPoints` ("Позволяет получить информацию о
 * всех точках выдачи заказов"). The documented response fields:
 * https://yandex.ru/support/delivery-boxberry/ru/pages/list-points
 *
 * `CountryCode` is Boxberry's numeric country code ("643 – Россия"), not ISO
 * 3166 alpha-2, so it is not mapped to `address.country`. `Address` is the full
 * address with the postcode in front ("115191, Москва г, Холодильный пер,
 * д.3, оф. 37А"); it is kept in metadata rather than parsed apart.
 */
export interface BoxberryPvz {
  Code?: string | null
  Name?: string | null
  Address?: string | null
  Phone?: string | null
  WorkShedule?: string | null
  TripDescription?: string | null
  DeliveryPeriod?: number | null
  CityCode?: string | null
  CityName?: string | null
  TariffZone?: string | null
  Settlement?: string | null
  Area?: string | null
  Country?: string | null
  GPS?: string | null
  AddressReduce?: string | null
  OnlyPrepaidOrders?: string | null
  Acquiring?: string | null
  DigitalSignature?: string | null
  CountryCode?: string | null
  NalKD?: string | null
  Metro?: string | null
  TypeOfOffice?: string | null
  VolumeLimit?: string | null
  LoadLimit?: number | null
  Postamat?: boolean | null
  EnableFitting?: boolean | null
  FittingType?: number | null
}

export function transformWarehouse(raw: BoxberryPvz): Warehouse {
  const code = raw.Code || undefined
  return {
    id: code,
    code,
    name: raw.Name || undefined,
    address: {
      // "Адрес сокращенный (улица, дом, номер квартиры)"
      street1: raw.AddressReduce || undefined,
      // "Наименование города"
      city: raw.CityName || undefined,
      // "Область"
      state: raw.Area || undefined,
      // "Телефон или телефоны"
      phone: raw.Phone || undefined,
    },
    metadata: { ...raw },
  }
}
