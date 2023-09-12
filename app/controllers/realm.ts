import { runQuery } from 'utils/db';
import KeycloakCore from 'utils/keycloak-core';

export async function getAllowedRealms(session: any) {
  const username = session?.user?.idir_username || '';
  const roles = session?.user?.client_roles || [];
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
      FROM rosters WHERE LOWER(technical_contact_idir_userid)=LOWER($1) OR LOWER(second_technical_contact_idir_userid)=LOWER($1) OR LOWER(product_owner_idir_userid)=LOWER($1) ORDER BY id ASC
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
        const [realmData] = await Promise.all([kcCore.getRealm(realm.realm)]);
        realm.idps = realmData?.identityProviders?.map((v) => v.displayName || v.alias) || [];
        const distinctProviders = new Set(realmData?.identityProviders?.map((v) => v.providerId) || []);
        realm.protocol = Array.from(distinctProviders);
      }
    }
  }

  return result?.rows;
}

export async function getAllowedRealmNames(session: any) {
  const username = session?.user?.idir_username || '';
  const roles = session?.user?.client_roles || [];
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
