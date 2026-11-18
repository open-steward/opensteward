/**
 * Fixtures copied from Coupang's first-party response examples. Only the
 * shipmentBoxId differs from the list page's example, which masks it as
 * "64253897***6401429": the single-PO page's example value is used instead,
 * as the string the client's lossless JSON parse yields for it.
 */
import type { RawCoupangOrder } from '../../../../../../src/verticals/ecommerce/adapters/coupang/transform/order'
import type { RawCoupangShippingPlace } from '../../../../../../src/verticals/ecommerce/adapters/coupang/transform/location'
import type { RawCoupangCoupon } from '../../../../../../src/verticals/ecommerce/adapters/coupang/transform/discount'
import type { RawCoupangStockResponse } from '../../../../../../src/verticals/ecommerce/adapters/coupang/transform/inventory'

/** https://developers.coupang.com/en/api/shipments/po-list-query-paging-by-day, response example `data[0]`. */
export function orderSheetExample(): RawCoupangOrder {
  return {
    shipmentBoxId: '642538970006401429',
    orderId: 22000009546234,
    orderedAt: '2025-01-15T14:17:13.973885-08:00',
    orderer: { name: '신*희', email: '', safeNumber: '+1(555)444-1234', ordererNumber: null },
    paidAt: '2025-01-15T14:17:13.973885-08:00',
    status: 'FINAL_DELIVERY',
    shippingPrice: { currencyCode: 'KRW', units: 2500, nanos: 0 },
    remotePrice: null,
    remoteArea: false,
    parcelPrintMessage: '문 앞',
    splitShipping: false,
    ableSplitShipping: false,
    receiver: {
      name: '신*희',
      safeNumber: '+1(555)444-1234',
      receiverNumber: null,
      addr1: '경기 광명시 하안1동 두산트레지움아파트',
      addr2: '107동701호',
      postCode: '423-747',
      consigneePrimaryAddress: 'address based on postcode',
    },
    orderItems: [
      {
        sequenceNo: '001',
        vendorItemPackageId: 0,
        vendorItemPackageName: '인디고뱅크키즈 기모 테잎배색 트레이닝 팬츠 IKTM17WG1',
        productId: 31846051,
        vendorItemId: 3242596358,
        vendorItemName: '인디고뱅크키즈 기모 테잎배색 트레이닝 팬츠 IKTM17WG1, 07 DARK GREY, 160호',
        shippingCount: 1,
        salesPrice: { currencyCode: 'KRW', units: 19900, nanos: 0 },
        orderPrice: { currencyCode: 'KRW', units: 19900, nanos: 0 },
        discountPrice: null,
        externalVendorSkuCode: '170816368810',
        sellerProductId: 80240831,
        sellerProductName: '인디고뱅크키즈 A5 기모 배색츄키니 IKTM17WG1',
        sellerProductItemName: '07 DARK GREY 160호',
        cancelCount: 0,
        holdCountForCancel: 0,
        estimatedShippingDate: '2017-10-16',
        plannedShippingDate: '',
        invoiceNumberUploadDate: '',
        pricingBadge: false,
        usedProduct: false,
        confirmDate: '2025-01-15T14:17:13.973885-08:00',
        deliveryChargeTypeName: '유료',
        productCategoryLevel1: '패션의류',
        productCategoryLevel2: '남성의류',
        canceled: false,
      },
    ],
    overseaShippingInfoDto: {
      personalCustomsClearanceCode: '',
      ordererSsn: '',
      ordererPhoneNumber: '',
      oneTimePccc: '',
      otpNumber: null,
    },
    deliveryCompanyName: 'CJ 대한통운',
    invoiceNumber: '340010913442',
    inTrasitDateTime: '2025-01-15T14:17:13.973885-08:00',
    deliveredDate: '2025-01-15T14:17:13.973885-08:00',
    refer: '안드로이드앱',
    shipmentType: 'THIRD_PARTY',
    isCod: false,
    ecommerceTypeCode: 'A',
    tradePartnerCode: 'K26001277',
    tradePartnerName: '쿠팡 주식회사',
    seller: {
      sellerName: 'TEST SELLER',
      sellerId: 'C01234567',
      purchasingAgencyCode: 'K26003052',
      purchasingAgencyName: '(주)뉴트리쿄스트',
    },
    extraProperties: { sameDayShipping: 'false', cutOffTimeHour: '0' },
  }
}

/** https://developers.coupang.com/en/api/logistics/query-a-shipping-location, response example `content[0]`. */
export function shippingPlaceExample(): RawCoupangShippingPlace {
  return {
    outboundShippingPlaceCode: 1111222,
    shippingPlaceName: '상품출고지1',
    createDate: '2019/06/24',
    placeAddresses: [
      {
        addressType: 'JIBUN',
        countryCode: 'KR',
        companyContactNumber: '02-1234-5678',
        phoneNumber2: '031-1234-5678',
        returnZipCode: '05510',
        returnAddress: '서울특별시 송파구 신천동',
        returnAddressDetail: '7-30, Tower출고지',
      },
    ],
    remoteInfos: [
      { remoteInfoId: 581487, deliveryCode: 'DIRECT', jeju: 5000, notJeju: 2500, usable: true },
    ],
    usable: true,
  }
}

/** https://developers.coupang.com/en/api/promotions/instant-discount-coupon-query-a-list-of-coupons-status, `data.content[0]`. */
export function couponExample(): RawCoupangCoupon {
  return {
    contractId: 63,
    vendorContractId: null,
    promotionName: null,
    couponId: 2246326,
    status: 'APPLIED',
    type: 'RATE',
    maxDiscountPrice: 40000,
    discount: 30,
    startAt: '2018-04-03 15:00:00',
    endAt: '2018-04-05 23:59:00',
    wowExclusive: 'false',
  }
}

/** https://developers.coupang.com/en/api/products/query-quantitypricestatus-by-product-items, `data`. */
export function stockExample(): RawCoupangStockResponse {
  return { sellerItemId: 3000000000, amountInStock: 0, salePrice: 32000, onSale: true }
}
