import axios from 'axios';
import url from 'url';
import https from 'https';

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
  rejectUnauthorized: true,
});

const fetchChesToken = async () => {
  const params = new url.URLSearchParams({ grant_type: 'client_credentials' });
  try {
    const { data } = await axios.post(process.env.CHES_TOKEN_ENDPOINT ?? '', params.toString(), {
      headers: {
        'Accept-Encoding': 'application/json',
      },
      httpsAgent,
      auth: {
        username: process.env.CHES_USERNAME ?? '',
        password: process.env.CHES_PASSWORD ?? '',
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
      process.env.CHES_API_ENDPOINT ?? '',
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
