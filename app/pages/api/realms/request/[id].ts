import type { NextApiRequest, NextApiResponse } from 'next';

// TODO: I've only added skeleton requests to show what client is passing to API. These are not fully implemented yet.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'PUT') {
      const { id } = req.query;
      const {status} = req.body
      console.log(`Updating request id ${id} to status ${status}`)
      res.status(200).json({success: true})
    }
    if (req.method === 'DELETE') {
      const { id } = req.query;
      console.log(`Deleting request id ${id}`)
      res.status(200).json({success: true})
    }
  }
  catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
}
