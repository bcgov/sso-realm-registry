import type { NextApiRequest, NextApiResponse } from 'next';
import getConfig from 'next/config';
import { promisify } from 'util';
import soapRequest from 'easy-soap-request';
import { parseString } from 'xml2js';
import get from 'lodash.get';
import { getIdirUserGuid } from 'utils/jwt';

const { serverRuntimeConfig = {} } = getConfig() || {};
const { bceid_service_id, bceid_service_basic_auth } = serverRuntimeConfig;

const parseStringSync = promisify(parseString);

const serviceUrl = 'https://gws2.test.bceid.ca/webservices/client/V10/BCeIDService.asmx?WSDL';
const defaultHeaders = {
  'Content-Type': 'text/xml;charset=UTF-8',
  authorization: `Basic ${bceid_service_basic_auth}`,
};

type MatchProperty = 'userGuid' | 'userId';
type MatchAccountType = 'Business' | 'Individual';

const generateXML = (
  property: MatchProperty,
  accountType: MatchAccountType,
  matchKey: string,
  idirUserGuid: string,
) => `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
 <soapenv:Header/>
 <soapenv:Body>
    <getAccountDetail xmlns="http://www.bceid.ca/webservices/Client/V10/">
       <accountDetailRequest>
          <onlineServiceId>${bceid_service_id}</onlineServiceId>
          <requesterAccountTypeCode>Internal</requesterAccountTypeCode>
          <requesterUserGuid>${idirUserGuid}</requesterUserGuid>
          <${property}>${matchKey}</${property}>
          <accountTypeCode>${accountType}</accountTypeCode>
       </accountDetailRequest>
    </getAccountDetail>
 </soapenv:Body>
</soapenv:Envelope>`;

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { body: payload = {}, headers: reqHeaders = {} } = req;
    const { property, accountType, matchKey } = payload;
    const { authorization } = reqHeaders;
    const token = authorization?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ success: false, error: 'unauthorized' });

    const idirUserGuid = await getIdirUserGuid(token);
    const xml = generateXML(property, accountType, matchKey, idirUserGuid);
    const { response }: any = await soapRequest({
      url: serviceUrl,
      headers: defaultHeaders,
      xml,
      timeout: 10000,
    });

    const { headers, body, statusCode } = response;
    const result = await parseStringSync(body);
    const data = get(result, 'soap:Envelope.soap:Body.0.getAccountDetailResponse.0.getAccountDetailResult.0');
    if (!data) throw Error('no data');

    const status = get(data, 'code.0');
    if (status === 'Failed') {
      const failureCode = get(data, 'failureCode.0');
      const message = get(data, 'message.0');
      throw Error(`${failureCode}: ${message}`);
    }

    const account = get(data, 'account.0');
    const parsed = parseAccount(account);
    return res.send(parsed);
  } catch (err: any) {
    console.error('error:', err);
    return res.status(500).json({ success: false, error: err.message || err });
  }
}

function parseAccount(data: any) {
  const guid = get(data, 'guid.0.value.0');
  const luid = get(data, 'luid.0.value.0');
  const dluid = get(data, 'dluid.0.value.0');
  const bceidLuid = get(data, 'bceidLuid.0.value.0');
  const bceidDluid = get(data, 'bceidDluid.0.value.0');
  const userId = get(data, 'userId.0.value.0');
  const displayName = get(data, 'displayName.0.value.0');
  const type = get(data, 'type.0.code.0');

  const baseContact = get(data, 'contact.0');
  const contact = {
    email: get(baseContact, 'email.0.value.0'),
    telephone: get(baseContact, 'telephone.0.value.0'),
    preferredName: get(baseContact, 'preferredName.0.value.0'),
    department: get(baseContact, 'department.0.value.0'),
  };

  const baseIndividualIdentity = get(data, 'individualIdentity.0');
  const baseName = get(baseIndividualIdentity, 'name.0');

  const individualIdentity = {
    name: {
      firstname: get(baseName, 'firstname.0.value.0'),
      middleName: get(baseName, 'middleName.0.value.0'),
      otherMiddleName: get(baseName, 'otherMiddleName.0.value.0'),
      surname: get(baseName, 'surname.0.value.0'),
      initials: get(baseName, 'initials.0.value.0'),
    },
    // dateOfBirth: get(baseIndividualIdentity, 'dateOfBirth.0.value.0'),
  };

  const baseInternalIdentity = get(data, 'internalIdentity.0');
  const internalIdentity = {
    title: get(baseInternalIdentity, 'title.0.value.0'),
    company: get(baseInternalIdentity, 'company.0.value.0'),
    organizationCode: get(baseInternalIdentity, 'organizationCode.0.value.0'),
    department: get(baseInternalIdentity, 'department.0.value.0'),
    office: get(baseInternalIdentity, 'office.0.value.0'),
    description: get(baseInternalIdentity, 'description.0.value.0'),
    employeeId: get(baseInternalIdentity, 'employeeId.0.value.0'),
  };

  return {
    guid,
    luid,
    dluid,
    bceidLuid,
    bceidDluid,
    userId,
    displayName,
    type,
    contact,
    individualIdentity,
    internalIdentity,
  };
}
