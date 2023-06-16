import axios from 'axios';
import { NextApiRequest, NextApiResponse } from 'next';
import getConfig from 'next/config';

const { serverRuntimeConfig = {} } = getConfig() || {};
const { ches_api_endpoint } = serverRuntimeConfig;

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method === 'POST') {
    const { body: payload = {}, headers: reqHeaders = {} } = req;
    const { Authorization, authorization } = reqHeaders || {};
    const authHeader = Authorization || authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'No authorization header was found' });
    }
    const headers: any = {
      Authorization: Authorization || authorization,
    };
    try {
      const result = await axios.post(ches_api_endpoint, payload, { headers });
      return res.status(200).json({ success: true, data: result?.data });
    } catch (err: any) {
      return res.status(err?.response?.status || 422).json({ success: false, error: err?.message || err });
    }
  } else {
    return res.status(400).json({ success: false, error: 'invalid request' });
  }
}
