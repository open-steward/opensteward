/**
 * Fixtures copied from bpost's first-party documentation.
 *
 * - Product configuration: "SHM API v5 examples/Get Product configuration/Example
 *   response.xml" in https://bpost.freshdesk.com/helpdesk/attachments/4122899940
 *   (trimmed to the first three price rows of the international product; the
 *   example's `name="Info "Next Day""` is not well-formed XML, so its quotes are
 *   escaped here).
 * - Order: "SHM API v5 examples/Retrieve Order Information/Example response.xml"
 *   in the same bundle (options, opening hours and receiver trimmed from the
 *   second box). orderInfoWithBoxes adds the <barcode> element of BoxInfoType
 *   (shm-deep-integration-v5.xsd, https://bpost.freshdesk.com/helpdesk/attachments/4139726880).
 * - Tracking: the trackingInfo example response in bpack integration manual
 *   v3.3.35 §E.3.4.2, https://bpost.freshdesk.com/helpdesk/attachments/4176380323.
 */

export const PRODUCT_CONFIGURATION = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
 <productConfiguration>
 <deliveryMethod name="home or office">
 <product name="bpack Pallet">
<price price20To30="550" price10To20="550" price5To10="550" price2To5="550" priceLessThan2="50" countryIso2Code="BE" />
<option price="0" name="Signature" />
 </product>
<product name="bpack Easy Retour">
<price price20To30="550" price10To20="550" price5To10="550" price2To5="550" priceLessThan2="50" countryIso2Code="BE" />
</product>
<product name="bpack 24h business">
<price price20To30="550" price10To20="550" price5To10="550" price2To5="550" priceLessThan2="50" countryIso2Code="BE" />
</product>
 <product name="bpack 24h Pro">
<price price20To30="550" price10To20="550" price5To10="550" price2To5="550" priceLessThan2="50" countryIso2Code="BE" />
<option price="800" name="Info &quot;Next Day&quot;" />
<option price="100" name="Saturday" />
 </product>
<product name="bpack Bus">
<price price20To30="550" price10To20="550" price5To10="550" price2To5="550" priceLessThan2="50" countryIso2Code="BE" />
</product>
 </deliveryMethod>
<deliveryMethod name="pick-up point">
 <product name="bpack@bpost">
<price price20To30="1000" price10To20="700" price5To10="600" price2To5="500" priceLessThan2="400" countryIso2Code="BE" />
<option price="0" name="Keep me informed via" />
 </product>
</deliveryMethod>
<deliveryMethod name="Parcel locker">
<product name="bpack 24/7">
<price price20To30="400" price10To20="400" price5To10="400" price2To5="400" priceLessThan2="400" countryIso2Code="BE" />
</product>
</deliveryMethod>
 <deliveryMethod name="home or office">
 <product name="bpack Europe Business">
<price price20To30="100" price10To20="100" price5To10="100" price2To5="100" priceLessThan2="100" countryIso2Code="AD" />
<price price20To30="100" price10To20="100" price5To10="100" price2To5="100" priceLessThan2="100" countryIso2Code="AE" />
<price price20To30="100" price10To20="100" price5To10="100" price2To5="100" priceLessThan2="100" countryIso2Code="AF" />
 </product>
 </deliveryMethod>
</productConfiguration>`

export const ORDER_REFERENCE = 'bpack 24h B2B - Ins(El)+iR+iND+iD'

export const ORDER_INFO = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<orderInfo>
	<accountId>123456</accountId>
	<reference>bpack 24h B2B - Ins(El)+iR+iND+iD</reference>
	<costCenter>Cost Center</costCenter>
	<orderLine>
		<text>Product 1</text>
		<nbOfItems>5</nbOfItems>
	</orderLine>
	<orderLine>
		<text>Product 1</text>
		<nbOfItems>1</nbOfItems>
	</orderLine>
	<box>
		<sender>
			<ns2:name>SENDER NAME</ns2:name>
			<ns2:company>SENDER COMPANY</ns2:company>
			<ns2:address>
				<ns2:streetName>MUNT</ns2:streetName>
				<ns2:number>1</ns2:number>
				<ns2:box>1</ns2:box>
				<ns2:postalCode>1000</ns2:postalCode>
				<ns2:locality>Brussel</ns2:locality>
				<ns2:countryCode>BE</ns2:countryCode>
			</ns2:address>
			<ns2:emailAddress>sender@mail.be</ns2:emailAddress>
			<ns2:phoneNumber>022011111</ns2:phoneNumber>
		</sender>
		<nationalBox>
			<ns3:atHome>
				<ns3:product>bpack 24h business</ns3:product>
				<ns3:options>
					<ns2:automaticSecondPresentation />
					<ns2:insured>
						<ns2:additionalInsurance value="2" />
					</ns2:insured>
					<ns2:signed />
				</ns3:options>
				<ns3:weight>2000</ns3:weight>
				<ns3:desiredDeliveryPlace>Place your delivery instructions here</ns3:desiredDeliveryPlace>
				<ns3:receiver>
					<ns2:name>RECEIVER NAME</ns2:name>
					<ns2:company>RECEIVER COMPANY</ns2:company>
					<ns2:address>
						<ns2:streetName>GROTE MARKT</ns2:streetName>
						<ns2:number>10</ns2:number>
						<ns2:box>A</ns2:box>
						<ns2:postalCode>2000</ns2:postalCode>
						<ns2:locality>Antwerpen</ns2:locality>
						<ns2:countryCode>BE</ns2:countryCode>
					</ns2:address>
					<ns2:emailAddress>receiver@mail.be</ns2:emailAddress>
					<ns2:phoneNumber>0032475123456</ns2:phoneNumber>
				</ns3:receiver>
			</ns3:atHome>
		</nationalBox>
		<remark>bpack 24h B2B VAS 126 - Ins(El)+iR+iND+iD</remark>
		<additionalCustomerReference>Reference that can be used for cross-referencing</additionalCustomerReference>
		<status>PENDING</status>
	</box>
	<box>
		<sender>
			<ns2:name>SENDER NAME</ns2:name>
		</sender>
		<nationalBox>
			<ns3:atHome>
				<ns3:product>bpack 24h business</ns3:product>
				<ns3:weight>2000</ns3:weight>
				<ns3:requestedDeliveryDate>2015-04-18+02:00</ns3:requestedDeliveryDate>
			</ns3:atHome>
		</nationalBox>
		<remark>bpack 24h B2B VAS 126 - Ins(El)+iR+iND+iD</remark>
		<additionalCustomerReference>Reference that can be used for cross-referencing</additionalCustomerReference>
		<status>PENDING</status>
	</box>
</orderInfo>`

/** One printed box, with the BoxInfoType <barcode> element. */
export function orderInfoWithBoxes(boxes: Array<{ barcode?: string; status: string }>): string {
  const body = boxes
    .map(
      (b) => `	<box>
		<nationalBox>
			<ns3:atHome>
				<ns3:product>bpack 24h Pro</ns3:product>
			</ns3:atHome>
		</nationalBox>
${b.barcode ? `		<barcode>${b.barcode}</barcode>\n` : ''}		<status>${b.status}</status>
	</box>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<orderInfo>
	<accountId>123456</accountId>
	<reference>201106241506</reference>
	<orderLine>
		<text>Product 1</text>
	</orderLine>
${body}
</orderInfo>`
}

export const ITEM_CODE = '323212345659900040669030'

export const ITEM_TRACKING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<itemTracking xmlns="http://schema.post.be/tracking/v1/"
xmlns:ns2="http://schema.post.be/announcement/common/v1/">
<itemCode>323212345659900040669030</itemCode>
        <sender>
                 <ns2:name>TEST COMPANY NAME</ns2:name>
                 <ns2:address>
                         <ns2:streetName>WETSTRAAT</ns2:streetName>
                         <ns2:houseNumber>1</ns2:houseNumber>
                         <ns2:postalCode>1000</ns2:postalCode>
                         <ns2:city>BRUSSELS</ns2:city>
                         <ns2:countryCode>BE</ns2:countryCode>
                 </ns2:address>
        </sender>
        <addressee>
                 <ns2:name>BARCODE TEAM BPACK</ns2:name>
                 <ns2:address>
                         <ns2:streetName>MUNTCENTRUM</ns2:streetName>
                         <ns2:postalCode>1000</ns2:postalCode>
                         <ns2:city>BRUSSELS</ns2:city>
                         <ns2:countryCode>BE</ns2:countryCode>
                 </ns2:address>
                 <ns2:contactDetail>
                         <ns2:emailAddress>BARCODESPARCELS@POST.BE</ns2:emailAddress>
                 </ns2:contactDetail>
        </addressee>
        <cityOrCountryOfdeparture>BRUSSELS</cityOrCountryOfdeparture>
        <cityOrCountryOfDestination>BRUSSELS</cityOrCountryOfDestination>
        <nameOfDestination>BARCODE TEAM BPACK</nameOfDestination>
        <deliveryTime>2012-11-23T09:31:07+01:00</deliveryTime>
        <customerReference>TEST AUTOMATIC SORTER</customerReference>
        <itemDetail>
                 <weightInGrams>380</weightInGrams>
                 <type>01</type>
                <options/>
       </itemDetail>
       <stateInfo>
                <time>2012-11-22T23:19:29+01:00</time>
                <stateCode>T00</stateCode>
                <stateDescription>Sorted - sorted_out</stateDescription>
       </stateInfo>
       <stateInfo>
                <time>2012-11-23T07:11:18.923+01:00</time>
                <stateCode>L00</stateCode>
                <stateDescription>BoundToRound - out_for_distribution</stateDescription>
       </stateInfo>
       <stateInfo>
                <time>2012-11-23T09:31:07.427+01:00</time>
                <stateCode>U01</stateCode>
                <stateDescription>DistributedNormally - regular</stateDescription>
       </stateInfo>
       <trackingId>gqwxvsyt</trackingId>
       <pickupPoint>
                <id>805140</id>
              <name>LIBRAIRIE WILSON</name>
            <streetName>RUE WASHINGTON / WASHINGTONSTRAAT</streetName>
            <houseNumber>66</houseNumber>
            <postalCode>1050</postalCode>
            <city>IXELLES / ELSENE</city>
       </pickupPoint>

</itemTracking>`
