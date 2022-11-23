import { runQuery } from 'utils/db';
import KeycloakCore from 'utils/keycloak-core';

export async function getAllowedRealms(session: any) {
  const username = session?.idir_username || '';
  const roles = session?.client_roles || [];
  const isAdmin = roles.includes('sso-admin');
  let result: any = null;

  if (isAdmin) {
    result = await runQuery('SELECT * FROM rosters ORDER BY id ASC');
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
        second_technical_contact_email,
        second_technical_contact_idir_userid,
        ministry,
        division,
        branch,
        created_at,
        updated_at
      FROM rosters WHERE LOWER(technical_contact_idir_userid)=LOWER($1) OR LOWER(product_owner_idir_userid)=LOWER($1) ORDER BY id ASC
      `,
      [username],
    );
  }

  const kcCore = new KeycloakCore('prod');

  if (result?.rows.length > 0) {
    const kcAdminClient = await kcCore.getAdminClient();
    if (kcAdminClient) {
      for (let x = 0; x < result?.rows.length; x++) {
        const realm = result?.rows[x];
        const [realmData, poName, techName, secTechName] = await Promise.all([
          kcCore.getRealm(realm.realm),
          kcCore.getIdirUserName(realm.product_owner_idir_userid),
          kcCore.getIdirUserName(realm.technical_contact_idir_userid),
          kcCore.getIdirUserName(realm.second_technical_contact_idir_userid),
        ]);

        realm.product_owner_name = poName;
        realm.technical_contact_name = techName;
        realm.second_technical_contact_name = secTechName;
        realm.displayName = realmData?.displayName || '';
        realm.idps = realmData?.identityProviders?.map((v) => v.displayName || v.alias) || [];
      }
    }
  }

  return result?.rows;
}

export async function getAllowedRealmNames(session: any) {
  const username = session?.idir_username || '';
  const roles = session?.client_roles || [];
  const isAdmin = roles.includes('sso-admin');
  let result: any = null;

  if (isAdmin) {
    result = await runQuery('SELECT realm FROM rosters ORDER BY id ASC');
  } else {
    result = await runQuery(
      `
      SELECT
        realm,
      FROM rosters WHERE LOWER(technical_contact_idir_userid)=LOWER($1) OR LOWER(product_owner_idir_userid)=LOWER($1) ORDER BY id ASC
      `,
      [username],
    );
  }

  return (result?.rows || []).map(({ realm }: { realm: string }) => realm);
}
