import { instance } from './axios';

export const getRealmEvents = async (realmId: string): Promise<[any[], null] | [null, any]> => {
  try {
    const result = await instance.get(`events?realmId=${realmId}`).then((res) => res.data);
    return [result as any[], null];
  } catch (err: any) {
    console.error(err);
    return [null, err];
  }
};
