import axios from 'axios';
import url from 'url';
import getConfig from 'next/config';
import https from 'https';

const { serverRuntimeConfig = {} } = getConfig() || {};
const { ches_api_endpoint, ches_token_endpoint, ches_username, ches_password } = serverRuntimeConfig;

interface EmailOptions {
  from?: string;
  to: string[];
  body: string;
  bodyType?: string;
  cc?: string[];
  bcc?: string[];
  delayTS?: number;
  encoding?: string;
  priority?: 'normal' | 'low' | 'high';
  subject?: string;
  tag?: string;
}

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

const fetchChesToken = async () => {
  const params = new url.URLSearchParams({ grant_type: 'client_credentials' });
  try {
    const { data } = await axios.post(ches_token_endpoint, params.toString(), {
      headers: {
        'Accept-Encoding': 'application/json',
      },
      httpsAgent,
      auth: {
        username: ches_username,
        password: ches_password,
      },
    });
    const { access_token } = data as { access_token: string };
    return [access_token, null];
  } catch (err) {
    return [null, err];
  }
};

export const sendEmail = async ({ from = 'bcgov.sso@gov.bc.ca', to, body, ...rest }: EmailOptions) => {
  try {
    const [accessToken, error] = await fetchChesToken();
    if (error) {
      throw new Error('unable to fetch ches token');
    }

    const res = await axios.post(
      ches_api_endpoint,
      {
        // see https://ches.nrs.gov.bc.ca/api/v1/docs#operation/postEmail for options
        bodyType: 'html',
        body,
        encoding: 'utf-8',
        from,
        priority: 'normal',
        subject: 'CHES Email Message',
        to,
        ...rest,
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    return res;
  } catch (err) {
    console.error(err);
  }
};
