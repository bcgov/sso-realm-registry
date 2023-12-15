import { instance } from './axios';
import { AzureUser } from 'types/realm-profile';

export const getIdirUsersByEmail = async (email: string): Promise<[AzureUser[], null] | [null, any]> => {
  try {
    const result = await instance.get(`azure-service/idir-users?email=${email}`).then((res) => res.data);
    return [result as AzureUser[], null];
  } catch (err: any) {
    console.error(err);
    return [null, err];
  }
};

export const getIdirUserId = async (id: string): Promise<[string, null] | [null, any]> => {
  try {
    const result = await instance.get(`azure-service/idir-user?id=${id}`).then((res) => res.data);
    return [result as string, null];
  } catch (err: any) {
    console.error(err);
    return [null, err];
  }
};
