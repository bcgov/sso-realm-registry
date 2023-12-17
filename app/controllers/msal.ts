import { ConfidentialClientApplication, IConfidentialClientApplication, ProtocolMode } from '@azure/msal-node';
import axios from 'axios';
import getConfig from 'next/config';

const { serverRuntimeConfig = {} } = getConfig() || {};
const { ms_graph_api_authority, ms_graph_api_client_id, ms_graph_api_client_secret } = serverRuntimeConfig;

let msalInstance: IConfidentialClientApplication;

const msalConfig = {
  auth: {
    authority: ms_graph_api_authority || '',
    clientId: ms_graph_api_client_id || '',
    clientSecret: ms_graph_api_client_secret || '',
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

export async function callAzureGraphApi(endpoint: string) {
  const accessToken = await getAzureAccessToken();

  const options = {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ConsistencyLevel: 'eventual',
    },
  };

  try {
    const response = await axios.get(endpoint, options);
    return response.data;
  } catch (error) {
    console.error(error);
    return error;
  }
}
