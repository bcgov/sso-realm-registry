import type { NextApiRequest, NextApiResponse } from 'next';
import getConfig from 'next/config';
import { promisify } from 'util';
import soapRequest from 'easy-soap-request';
import { parseString } from 'xml2js';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import jws from 'jws';
import jwkToPem from 'jwk-to-pem';
import map from 'lodash.map';
import get from 'lodash.get';

const { serverRuntimeConfig = {} } = getConfig() || {};
const { bceid_service_id, bceid_service_basic_auth, idir_jwks_uri, idir_issuer } = serverRuntimeConfig;

const parseStringSync = promisify(parseString);

const serviceUrl = 'https://gws2.development.bceid.ca/webservices/client/V10/BCeIDService.asmx?WSDL';
const defaultHeaders = {
  'Content-Type': 'text/xml;charset=UTF-8',
  authorization: `Basic ${bceid_service_basic_auth}`,
};

type SearchCriteria = 'userId' | 'firstName' | 'lastName' | 'email';

const generateXML = (
  criteria: SearchCriteria,
  key: string,
  idirUserGuide: string,
) => `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:V10="http://www.bceid.ca/webservices/Client/V10/">
    <soapenv:Header />
    <soapenv:Body>
        <V10:searchInternalAccount>
            <V10:internalAccountSearchRequest>
                <V10:onlineServiceId>${bceid_service_id}</V10:onlineServiceId>
                <V10:requesterAccountTypeCode>Internal</V10:requesterAccountTypeCode>
                <V10:requesterUserGuid>${idirUserGuide}</V10:requesterUserGuid>
                <V10:pagination>
                    <V10:pageSizeMaximum>5</V10:pageSizeMaximum>
                    <V10:pageIndex>1</V10:pageIndex>
                </V10:pagination>
                <V10:sort>
                    <V10:direction>Ascending</V10:direction>
                    <V10:onProperty>UserId</V10:onProperty>
                </V10:sort>
                <V10:accountMatch>
                    <V10:${criteria}>
                       <V10:value>${encodeURIComponent(key)}</V10:value>
                       <V10:matchPropertyUsing>StartsWith</V10:matchPropertyUsing>
                    </V10:${criteria}>
                 </V10:accountMatch>
            </V10:internalAccountSearchRequest>
        </V10:searchInternalAccount>
    </soapenv:Body>
</soapenv:Envelope>`;

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { query = {}, headers: reqHeaders = {} } = req;
    const { field, search } = query;
    const { authorization } = reqHeaders;
    const token = authorization?.split('Bearer ')[1];
    if (!token) throw Error('invalid access');

    const idirUserGuide = await getIdirUserGuid(token);
    const xml = generateXML(field as SearchCriteria, search as string, idirUserGuide);
    const { response }: any = await soapRequest({
      url: serviceUrl,
      headers: defaultHeaders,
      xml,
      timeout: 10000,
    });

    const { headers, body, statusCode } = response;
    const result = await parseStringSync(body);
    const data = get(result, 'soap:Envelope.soap:Body.0.searchInternalAccountResponse.0.searchInternalAccountResult.0');
    if (!data) throw Error('no data');

    const status = get(data, 'code.0');
    if (status === 'Failed') {
      const failureCode = get(data, 'failureCode.0');
      const message = get(data, 'message.0');
      throw Error(`${failureCode}: ${message}`);
    }

    const message = get(data, 'message.0');
    const count = get(data, 'pagination.0.totalItems.0');
    const pageSize = get(data, 'pagination.0.requestedPageSize.0');
    const pageIndex = get(data, 'pagination.0.requestedPageIndex.0');
    const items = map(get(data, 'accountList.0.BCeIDAccount'), parseAccount);

    return res.send(items);
  } catch (err: any) {
    console.error('error:', err);
    res.status(200).json({ success: false, error: err.message || err });
  }
}

function parseAccount(data: any) {
  const guid = get(data, 'guid.0.value.0');
  const userId = get(data, 'userId.0.value.0');
  const displayName = get(data, 'displayName.0.value.0');

  const baseContact = get(data, 'contact.0');
  const contact = {
    email: get(baseContact, 'email.0.value.0'),
    telephone: get(baseContact, 'telephone.0.value.0'),
    preference: get(baseContact, 'preference.0.value.0'),
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
    userId,
    displayName,
    contact,
    individualIdentity,
    internalIdentity,
  };
}

async function getIdirUserGuid(token: string) {
  const { header } = jws.decode(token);

  const { keys }: any = await axios.get(idir_jwks_uri).then((res) => res.data);

  const key = keys.find((jwkKey: any) => jwkKey.kid === header.kid);
  const isValidKid = !!key;

  if (!isValidKid) return null;

  const pem = jwkToPem(key);

  const { identity_provider, idir_userid }: any = jwt.verify(token, pem, {
    audience: 'sso-requests',
    issuer: idir_issuer,
    maxAge: '8h',
    ignoreExpiration: true,
  });

  if (identity_provider !== 'idir') return null;

  return idir_userid;
}
