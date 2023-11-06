import type { NextApiRequest, NextApiResponse } from 'next';

// TODO: I've only added skeleton requests to show what client is passing to API. These are not fully implemented yet.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'POST') {
        console.log("body is", req.body)
        setTimeout(() => {
            res.status(200).send({success: true, id: 1234})
        }, 1000);
    }
  }
  catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
}
