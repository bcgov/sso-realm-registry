/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  compiler: {
    styledComponents: true,
  },
  serverRuntimeConfig: {
    app_env: process.env.APP_ENV || 'development',
    sso_configuration_url: process.env.SSO_CONFIGURATION_URL,
    sso_url: process.env.SSO_URL || 'http://localhost:8080',
    sso_client_id: process.env.SSO_CLIENT_ID || '',
    sso_client_secret: process.env.SSO_CLIENT_SECRET || '',
    sso_redirect_uri: process.env.SSO_REDIRECT_URI || 'http://localhost:3000',
    sso_logout_redirect_uri: process.env.SSO_LOGOUT_REDIRECT_URI || 'http://localhost:3000',
    sso_authorization_response_type: process.env.SSO_AUTHORIZATION_RESPONSE_TYPE || 'code',
    sso_authorization_scope: process.env.SSO_AUTHORIZATION_SCOPE || 'openid',
    sso_token_grant_type: process.env.SSO_TOKEN_GRANT_TYPE || 'authorization_code',
    jwt_secret: process.env.JWT_SECRET || 'verysecuresecret',
    jwt_token_expiry: process.env.JWT_TOKEN_EXPIRY || '1h',
    pg_host: process.env.PGHOST || 'localhost',
    pg_port: process.env.PGPORT || '5432',
    pg_user: process.env.PGUSER,
    pg_password: process.env.PGPASSWORD,
    pg_database: process.env.PGDATABASE || 'realm_profile',
    pg_ssl: process.env.PGSSL === 'true',

    dev_kc_url: process.env.DEV_KC_URL || 'https://dev.loginproxy.gov.bc.ca',
    dev_kc_username: process.env.DEV_KC_USERNAME || '',
    dev_kc_password: process.env.DEV_KC_PASSWORD,

    test_kc_url: process.env.TEST_KC_URL || 'https://dev.loginproxy.gov.bc.ca',
    test_kc_username: process.env.TEST_KC_USERNAME || '',
    test_kc_password: process.env.TEST_KC_PASSWORD,

    prod_kc_url: process.env.PROD_KC_URL || 'https://dev.loginproxy.gov.bc.ca',
    prod_kc_username: process.env.PROD_KC_USERNAME || '',
    prod_kc_password: process.env.PROD_KC_PASSWORD,

    ches_api_endpoint: process.env.CHES_API_ENDPOINT || 'https://ches.api.gov.bc.ca/api/v1/email',
    ches_token_endpoint:
      process.env.CHES_TOKEN_ENDPOINT ||
      'https://dev.loginproxy.gov.bc.ca/auth/realms/xxxxxxx/protocol/openid-connect/token',
    ches_username: process.env.CHES_USERNAME,
    ches_password: process.env.CHES_PASSWORD,

    bceid_service_id: process.env.BCEID_SERVICE_ID,
    bceid_web_service_url: process.env.BCEID_WEB_SERVICE_URL || '',
    bceid_service_basic_auth: process.env.BCEID_SERVICE_BASIC_AUTH,
    idir_jwks_uri: process.env.IDIR_JWKS_URI,
    idir_issuer: process.env.IDIR_ISSUER,
    idir_audience: process.env.IDIR_AUDIENCE,
    tf_gh_org: process.env.TF_GH_ORG,
    tf_gh_repo: process.env.TF_GH_REPO,
    tf_module_gh_ref: process.env.TF_MODULE_GH_REF,
    gh_access_token: process.env.GH_ACCESS_TOKEN,
    gh_api_token: process.env.GH_API_TOKEN || '',
    idir_requestor_user_guid: process.env.IDIR_REQUESTOR_USER_GUID || '',
    ms_graph_api_authority: process.env.MS_GRAPH_API_AUTHORITY,
    ms_graph_api_client_id: process.env.MS_GRAPH_API_CLIENT_ID,
    ms_graph_api_client_secret: process.env.MS_GRAPH_API_CLIENT_SECRET,
  },
  publicRuntimeConfig: {},
  async headers() {
    if (process.env.SECURE_HEADERS === 'false') return [];

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self';base-uri 'self';block-all-mixed-content;font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests",
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'no-referrer',
          },
          {
            key: 'Permissions-Policy',
            value:
              'accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), camera=(), cross-origin-isolated=(), display-capture=(), document-domain=(), encrypted-media=(), execution-while-not-rendered=(), execution-while-out-of-viewport=(), fullscreen=(), geolocation=(), gyroscope=(), keyboard-map=(), magnetometer=(), microphone=(), midi=(), navigation-override=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), sync-xhr=(), usb=(), web-share=(), xr-spatial-tracking=()',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
          {
            key: 'Surrogate-Control',
            value: 'no-store',
          },
        ],
      },
    ];
  },
  poweredByHeader: false,
};
