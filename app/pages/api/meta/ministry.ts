import axios from 'axios';
import type { NextApiRequest, NextApiResponse } from 'next';
import { runQuery } from 'utils/db';

interface ErrorData {
  success: boolean;
  error: string | object;
}

type Data = ErrorData | string[];

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  try {
    if (req.method === 'GET') {
      const result = await axios.get(
        `https://catalogue.data.gov.bc.ca/api/3/action/organization_autocomplete?q=ministry&limit=10`,
      );

      return res.send(result.data.result);
    } else {
      return res.send(['Other']);
    }
  } catch (err: any) {
    console.error(err);
    res.status(200).json({ success: false, error: err.message || err });
  }
}
