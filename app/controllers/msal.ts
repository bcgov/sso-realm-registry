import { ConfidentialClientApplication, IConfidentialClientApplication } from '@azure/msal-node';
import axios from 'axios';

let msalInstance: IConfidentialClientApplication;

export interface MsGraphUserValue {
  mailNickname: string;
  displayName: string;
  mail: string;
  givenName: string;
  surname: string;
  companyName: string;
  department: string;
  jobTitle: string;
  mobilePhone: string;
  /** Extended attributes, see annotations for details. */
  onPremisesExtensionAttributes: {
    extensionAttribute1?: string | null;
    extensionAttribute2?: string | null;
    extensionAttribute3?: string | null;
    extensionAttribute4?: string | null;
    extensionAttribute5?: string | null;
    extensionAttribute6?: string | null;
    extensionAttribute7?: string | null;
    extensionAttribute8?: string | null;
    extensionAttribute9?: string | null;
    extensionAttribute10?: string | null;
    extensionAttribute11?: string | null;
    /** This attribute will be the internal IDIR guid */
    extensionAttribute12?: string | null;
    extensionAttribute13?: string | null;
    extensionAttribute14?: string | null;
    extensionAttribute15?: string | null;
  };
}

export interface MsGraphUserResponse {
  value: MsGraphUserValue[];
}

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

export const fetchIdirUser = async ({ userId }: { userId: string }) => {
  const response = (await callAzureGraphApi({
    pathSegments: ['users'],
    query: {
      $filter: `mailNickname eq '${userId}'`,
      $select: 'onPremisesExtensionAttributes,displayName,mail,givenName,surname',
    },
  })) as MsGraphUserResponse;
  if (!response?.value?.length) {
    return false;
  }
  const result = response.value[0];
  if (!result) throw new Error(`No user found with userId ${userId}`);

  return {
    guid: result.onPremisesExtensionAttributes.extensionAttribute12 as string,
    userId,
    displayName: result.displayName,
    email: result.mail,
    firstName: result.givenName,
    lastName: result.surname,
  };
};
