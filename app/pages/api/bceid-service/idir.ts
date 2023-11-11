import type { NextApiRequest, NextApiResponse } from 'next';
import { getIdirUserGuid } from 'utils/jwt';
import { SearchCriteria, generateXML, getBceidAccounts, makeSoapRequest } from 'utils/idir';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { body: payload = {}, headers: reqHeaders = {} } = req;
    const { field, search, limit, page } = payload;
    const { authorization } = reqHeaders;
    const token = authorization?.split('Bearer ')[1];
    if (!token) throw Error('invalid access');

    const idirUserGuid = await getIdirUserGuid(token);
    const xml = generateXML(field as SearchCriteria, search, idirUserGuid, limit, page);
    const { response }: any = await makeSoapRequest(xml);
    return res.send(await getBceidAccounts(response));
  } catch (err: any) {
    console.error('error:', err);
    res.status(200).json({ success: false, error: err.message || err });
  }
}
