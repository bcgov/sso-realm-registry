import { runQuery } from 'utils/db';

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
      FROM rosters WHERE LOWER(technical_contact_idir_userid)=LOWER($1) OR LOWER(second_technical_contact_idir_userid)=LOWER($1) OR LOWER(product_owner_idir_userid)=LOWER($1) ORDER BY id ASC
      `,
      [username],
    );
  }

  return (result?.rows || []).map(({ realm }: { realm: string }) => realm);
}
