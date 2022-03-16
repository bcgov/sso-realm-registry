import type { NextApiRequest, NextApiResponse } from 'next';
import { runQuery } from 'utils/db';
import { validateRequest } from 'utils/jwt';
import KeycloakCore from 'utils/keycloak-core';
import { sendUpdateEmail } from 'utils/mailer';

interface ErrorData {
  success: boolean;
  error: string | object;
}

type Data = ErrorData | string;

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  try {
    const { id } = req.query;

    const session = await validateRequest(req, res);
    const username = session?.idir_username || '';
    const roles = session?.client_roles || [];
    const isAdmin = roles.includes('sso-admin');

    if (!username) return res.status(401).json({ success: false, error: 'jwt expired' });

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
            openshift_namespace,
            product_owner_email,
            product_owner_idir_userid,
            technical_contact_email,
            technical_contact_idir_userid,
            ministry,
            division,
            branch,
            created_at,
            updated_at
          FROM rosters WHERE id=$1 AND (LOWER(technical_contact_idir_userid)=LOWER($2) OR LOWER(product_owner_idir_userid)=LOWER($2))
          `,
          [id, username],
        );
      }

      const realm = result?.rows.length > 0 ? result?.rows[0] : null;
      if (realm) {
        const [realmData, poName, techName] = await Promise.all([
          kcCore.getRealm(realm.realm),
          kcCore.getIdirUserName(realm.product_owner_idir_userid),
          kcCore.getIdirUserName(realm.technical_contact_idir_userid),
        ]);

        realm.product_owner_name = poName;
        realm.technical_contact_name = techName;
        realm.displayName = realmData?.displayName || '';
        realm.idps = realmData?.identityProviders?.map((v) => v.displayName || v.alias) || [];
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
        openshift_namespace,
        technical_contact_email,
        product_owner_email,
        technical_contact_idir_userid,
        product_owner_idir_userid,
        admin_note_1,
        admin_note_2,
        next_steps,
        material_to_send,
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
              openshift_namespace=$3,
              technical_contact_email=$4,
              product_owner_email=$5,
              technical_contact_idir_userid=$6,
              ministry=$7,
              division=$8,
              branch=$9,
              admin_note_1=$10,
              admin_note_2=$11,
              next_steps=$12,
              material_to_send=$13,
              updated_at=now()
            WHERE id=$1
            RETURNING *`,
          [
            id,
            product_name,
            openshift_namespace,
            technical_contact_email,
            product_owner_email,
            technical_contact_idir_userid,
            _ministry,
            _division,
            _branch,
            admin_note_1,
            admin_note_2,
            next_steps,
            material_to_send,
          ],
        );
      } else if (isPO) {
        result = await runQuery(
          `
            UPDATE rosters
            SET
              product_name=$3,
              openshift_namespace=$4,
              technical_contact_email=$5,
              product_owner_email=$6,
              technical_contact_idir_userid=$7,
              ministry=$8,
              division=$9,
              branch=$10,
              updated_at=now()
            WHERE id=$1 AND LOWER(product_owner_idir_userid)=LOWER($2)
            RETURNING *`,
          [
            id,
            username,
            product_name,
            openshift_namespace,
            technical_contact_email,
            product_owner_email,
            technical_contact_idir_userid,
            _ministry,
            _division,
            _branch,
          ],
        );
      } else {
        result = await runQuery(
          `
          UPDATE rosters
          SET
            product_name=$3,
            openshift_namespace=$4,
            technical_contact_email=$5,
            ministry=$6,
            division=$7,
            branch=$8,
            updated_at=now()
          WHERE id=$1 AND LOWER(technical_contact_idir_userid)=LOWER($2)
          RETURNING *`,
          [id, username, product_name, openshift_namespace, technical_contact_email, _ministry, _division, _branch],
        );
      }

      const realm = result?.rows.length > 0 ? result?.rows[0] : null;
      sendUpdateEmail(realm, session);

      if (!isAdmin && realm) {
        delete realm.admin_note_1;
        delete realm.admin_note_2;
        delete realm.next_steps;
        delete realm.material_to_send;
      }

      return res.send(realm);
    }
  } catch (err: any) {
    console.error(err);
    res.status(200).json({ success: false, error: err.message || err });
  }
}
