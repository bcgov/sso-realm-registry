import { Realms } from 'keycloak-admin/lib/resources/realms';
import type { NextApiRequest, NextApiResponse } from 'next';
import { runQuery } from 'utils/db';
import { validateRequest } from 'utils/jwt';
import { getAdminClient, getIdirUserName, getIDPNames, getRealm } from 'utils/keycloak-core';

export async function getMyRealms(idirId: string) {
  const result: any = await runQuery(
    'SELECT * from rosters WHERE LOWER(technical_contact_idir_userid)=LOWER($1) OR LOWER(product_owner_idir_userid)=LOWER($1) ORDER BY id asc',
    [idirId],
  );

  if (result?.rows.length > 0) {
    const kcAdminClient = await getAdminClient();
    if (kcAdminClient) {
      for (let x = 0; x < result?.rows.length; x++) {
        const realm = result?.rows[x];
        const [realmData, poName, techName] = await Promise.all([
          getRealm(realm.realm),
          getIdirUserName(realm.product_owner_idir_userid),
          getIdirUserName(realm.technical_contact_idir_userid),
        ]);

        realm.product_owner_name = poName;
        realm.technical_contact_name = techName;
        realm.displayName = realmData?.displayName || '';
        realm.idps = realmData?.identityProviders?.map((v) => v.displayName || v.alias) || [];
      }
    }
  }

  return result?.rows;
}
