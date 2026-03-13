import OIDC from './oidc';

let _oidc: any;
export const createOIDC = () => {
  if (_oidc) return _oidc;

  _oidc = new OIDC({
    configurationUrl: process.env.SSO_CONFIGURATION_URL ?? '',
    url: process.env.SSO_URL ?? '',
    clientId: process.env.SSO_CLIENT_ID ?? '',
    clientSecret: process.env.SSO_CLIENT_SECRET ?? '',
    redirectUri: process.env.SSO_REDIRECT_URI ?? '',
    logoutRedirectUri: process.env.SSO_LOGOUT_REDIRECT_URI ?? '',
    authResponseType: process.env.SSO_AUTHORIZATION_RESPONSE_TYPE ?? '',
    authScope: process.env.SSO_AUTHORIZATION_SCOPE ?? '',
    tokenGrantType: process.env.SSO_TOKEN_GRANT_TYPE ?? '',
  });

  return _oidc;
};

export default { createOIDC };
