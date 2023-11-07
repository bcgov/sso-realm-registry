import type { NextApiRequest, NextApiResponse } from 'next';

// TODO: I've only added skeleton requests to show what client is passing to API. These are not fully implemented yet.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'POST') {
        // Thinking it is easiest to verify uniqueness in post request. 
        // Putting in example here of what client expects, using "realm" as an demo duplicate name.
        if (req.body.realmName === 'realm') {
            setTimeout(() => {
                res.status(422).send({success: false, message: `Realm with name "${req.body.realmName}" already exists.`})
            }, 1000);
        }
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
