import type { Carrier } from '../../../schema/carrier'

/**
 * Pochta Rossii carrier transform.
 *
 * The Otpravka API has no carrier listing endpoint — Pochta Rossii itself is
 * the single carrier. The canonical carrier record is derived from the known
 * platform identity and the mail types documented in the Otpravka specification.
 *
 * Mail type codes (mail-type) from the Otpravka specification (partial list):
 *   2   — Registered letter (Заказное письмо)
 *   3   — Registered postcard (Заказная открытка)
 *  22   — Registered package (Бандероль заказная)
 *  47030 — First-class parcel (Посылка первого класса)
 *  47060 — Standard parcel (Посылка онлайн)
 *  47920 — EMS parcel
 */

/** Static carrier record for Pochta Rossii (Russian Post). */
export const POCHTA_RUSSIA_CARRIER: Carrier = {
  id: 'pochta-russia',
  name: 'Pochta Rossii (Russian Post)',
  code: 'pochta-russia',
  trackingUrlTemplate:
    'https://www.pochta.ru/tracking#{trackingNumber}',
  isActive: true,
  services: [
    { code: '47030', name: 'Посылка первого класса (First-class parcel)' },
    { code: '47060', name: 'Посылка онлайн (Online parcel)' },
    { code: '47920', name: 'EMS' },
    { code: '22',    name: 'Бандероль заказная (Registered package)' },
    { code: '2',     name: 'Заказное письмо (Registered letter)' },
    { code: '3',     name: 'Заказная открытка (Registered postcard)' },
  ],
}

/** Returns the single static carrier for Pochta Rossii. */
export function transformCarrier(): Carrier {
  return POCHTA_RUSSIA_CARRIER
}
