import { ConfidentialClientApplication, IConfidentialClientApplication } from '@azure/msal-node';
import axios from 'axios';

let msalInstance: IConfidentialClientApplication;

export interface MsGraphUserValue {
  /** Azure object id; the only identifier the realm form sends for a member. */
  id: string;
  mailNickname: string;
  onPremisesSamAccountName: string;
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

export interface DirectoryUser {
  /** Internal IDIR guid; null when the account has no extensionAttribute12. */
  guid: string | null;
  idirUsername: string;
  email: string | null;
  displayName: string | null;
}

/** Fields a directory lookup needs to populate a `users` row. */
const directoryUserSelect = 'id,onPremisesExtensionAttributes,onPremisesSamAccountName,mailNickname,mail,displayName';

const toDirectoryUser = (result?: Partial<MsGraphUserValue> | null): DirectoryUser | null => {
  if (!result?.id) return null;
  const idirUsername = result.onPremisesSamAccountName || result.mailNickname;
  if (!idirUsername) return null;

  return {
    guid: result.onPremisesExtensionAttributes?.extensionAttribute12 ?? null,
    idirUsername,
    email: result.mail ?? null,
    displayName: result.displayName ?? null,
  };
};

/**
 * Looks a user up by their Azure object id, which is the only identifier the realm
 * form sends. Identity is always re-resolved here rather than trusted from the client,
 * because the guid it returns is the direct provisioning key for realm admin access.
 */
export const fetchIdirUserByAzureId = async (azureId: string): Promise<DirectoryUser | null> => {
  const result = await callAzureGraphApi({
    pathSegments: ['users', azureId],
    query: { $select: directoryUserSelect },
  });

  return toDirectoryUser(result);
};
