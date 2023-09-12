import type { NextApiRequest, NextApiResponse } from 'next';
import { runQuery } from 'utils/db';
import { validateRequest } from 'utils/jwt';
import KeycloakCore from 'utils/keycloak-core';
import { sendUpdateEmail } from 'utils/mailer';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';

interface ErrorData {
  success: boolean;
  error: string | object;
}

type Data = ErrorData | string;

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  try {
    const { id } = req.query;

    const session: any = await getServerSession(req, res, authOptions);

    if (!session) return res.status(401).json({ success: false, error: 'unauthorized' });

    const username = session?.user?.idir_username || '';
    const roles = session?.user?.client_roles || [];
    const isAdmin = roles.includes('sso-admin');

    const kcCore = new KeycloakCore('prod');

    if (req.method === 'GET') {
      let result: any = null;
      if (isAdmin) {
        result = await runQuery('SELECT * from rosters WHERE id=$1', [id]);
      } else {
        result = await runQuery(
          `
          SELECT
            id,
            realm,
            product_name,
            product_owner_email,
            product_owner_idir_userid,
            technical_contact_email,
            technical_contact_idir_userid,
            second_technical_contact_email,
            second_technical_contact_idir_userid,
            ministry,
            division,
            branch,
            created_at,
            updated_at,
            rc_channel,
            rc_channel_owned_by
          FROM rosters WHERE id=$1 AND (LOWER(technical_contact_idir_userid)=LOWER($2) OR LOWER(second_technical_contact_idir_userid)=LOWER($2) OR LOWER(product_owner_idir_userid)=LOWER($2))
          `,
          [id, username],
        );
      }

      const realm = result?.rows.length > 0 ? result?.rows[0] : null;
      if (realm) {
        const [realmData] = await Promise.all([kcCore.getRealm(realm.realm)]);
        realm.idps = realmData?.identityProviders?.map((v) => v.displayName || v.alias) || [];
        const distinctProviders = new Set(realmData?.identityProviders?.map((v) => v.providerId) || []);
        realm.protocol = Array.from(distinctProviders);
      }

      return res.send(realm);
    } else if (req.method === 'PUT') {
      const {
        ministry,
        ministry_other,
        division,
        division_other,
        branch,
        branch_other,
        product_name,
        technical_contact_email,
        product_owner_email,
        technical_contact_idir_userid,
        product_owner_idir_userid,
        rc_channel,
        rc_channel_owned_by,
        material_to_send,
        second_technical_contact_email,
        second_technical_contact_idir_userid,
      } = req.body;

      const _ministry = ministry === 'Other' ? ministry_other : ministry;
      const _division = division === 'Other' ? division_other : division;
      const _branch = branch === 'Other' ? branch_other : branch;

      const isPO = username.toLowerCase() === product_owner_idir_userid?.toLowerCase();

      let result: any;
      if (isAdmin) {
        result = await runQuery(
          `
            UPDATE rosters
            SET
              product_name=$2,
              technical_contact_email=$3,
              product_owner_email=$4,
              technical_contact_idir_userid=$5,
              product_owner_idir_userid=$6,
              ministry=$7,
              division=$8,
              branch=$9,
              rc_channel=$10,
              rc_channel_owned_by=$11,
              material_to_send=$12,
              second_technical_contact_email=$13,
              second_technical_contact_idir_userid=$14,
              updated_at=now()
            WHERE id=$1
            RETURNING *`,
          [
            id,
            product_name,
            technical_contact_email,
            product_owner_email,
            technical_contact_idir_userid,
            product_owner_idir_userid,
            _ministry,
            _division,
            _branch,
            rc_channel,
            rc_channel_owned_by,
            material_to_send,
            second_technical_contact_email,
            second_technical_contact_idir_userid,
          ],
        );
      } else if (isPO) {
        result = await runQuery(
          `
            UPDATE rosters
            SET
              product_name=$3,
              technical_contact_email=$4,
              product_owner_email=$5,
              technical_contact_idir_userid=$6,
              ministry=$7,
              division=$8,
              branch=$9,
              second_technical_contact_email=$10,
              second_technical_contact_idir_userid=$11,
              updated_at=now()
            WHERE id=$1 AND LOWER(product_owner_idir_userid)=LOWER($2)
            RETURNING *`,
          [
            id,
            username,
            product_name,
            technical_contact_email,
            product_owner_email,
            technical_contact_idir_userid,
            _ministry,
            _division,
            _branch,
            second_technical_contact_email,
            second_technical_contact_idir_userid,
          ],
        );
      } else {
        result = await runQuery(
          `
          UPDATE rosters
          SET
            product_name=$3,
            technical_contact_email=$4,
            ministry=$5,
            division=$6,
            branch=$7,
            second_technical_contact_email=$8,
            second_technical_contact_idir_userid=$9,
            updated_at=now()
          WHERE id=$1 AND (LOWER(technical_contact_idir_userid)=LOWER($2) OR LOWER(second_technical_contact_idir_userid)=LOWER($2))
          RETURNING *`,
          [
            id,
            username,
            product_name,
            technical_contact_email,
            _ministry,
            _division,
            _branch,
            second_technical_contact_email,
            second_technical_contact_idir_userid,
          ],
        );
      }

      const realm = result?.rows.length > 0 ? result?.rows[0] : null;
      sendUpdateEmail(realm, session);

      if (!isAdmin && realm) {
        delete realm.protocol;
        delete realm.rc_channel;
        delete realm.rc_channel_owned_by;
        delete realm.material_to_send;
      }

      return res.send(realm);
    }
  } catch (err: any) {
    console.error(err);
    res.status(200).json({ success: false, error: err.message || err });
  }
}
