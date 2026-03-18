import { ConfidentialClientApplication, IConfidentialClientApplication, ProtocolMode } from '@azure/msal-node';
import axios from 'axios';

let msalInstance: IConfidentialClientApplication;

const msalConfig = {
  auth: {
    authority: process.env.MS_GRAPH_API_AUTHORITY || '',
    clientId: process.env.MS_GRAPH_API_CLIENT_ID || '',
    clientSecret: process.env.MS_GRAPH_API_CLIENT_SECRET || '',
  },
};

export async function getAzureAccessToken() {
  const request = {
    scopes: ['https://graph.microsoft.com/.default'],
  };

  try {
    if (!msalInstance) {
      msalInstance = new ConfidentialClientApplication(msalConfig);
    }

    const response = await msalInstance.acquireTokenByClientCredential(request);
    return response?.accessToken;
  } catch (error) {
    console.error(error);
    throw new Error('Error acquiring access token');
  }
}

export async function callAzureGraphApi({
  pathSegments = [],
  query = {},
}: {
  pathSegments: string[];
  query: { [key: string]: string };
}) {
  const baseURL = new URL('https://graph.microsoft.com/v1.0/');

  const safePath = pathSegments.map((seg) => encodeURIComponent(seg)).join('/');

  baseURL.pathname += safePath;

  for (const [key, value] of Object.entries(query)) {
    baseURL.searchParams.set(key, value);
  }

  const accessToken = await getAzureAccessToken();

  const options = {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ConsistencyLevel: 'eventual',
    },
  };

  try {
    const response = await axios.get(baseURL.toString(), options);
    return response.data;
  } catch (error) {
    console.error(error);
    return error;
  }
}
