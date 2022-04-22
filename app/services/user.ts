import { instance } from './axios';

export const findIdirUser = async (searchKey: string): Promise<[any, null] | [null, any]> => {
  try {
    const result = await instance.get(`users/idir?search=${searchKey}`).then((res) => res.data);
    return [result as any, null];
  } catch (err: any) {
    console.error(err);
    return [null, err];
  }
};

export const deleteIdirUser = async (searchKey: string, env: string): Promise<[any, null] | [null, any]> => {
  try {
    const result = await instance.delete(`users/idir?search=${searchKey}&env=${env}`).then((res) => res.data);
    return [result as any, null];
  } catch (err: any) {
    console.error(err);
    return [null, err];
  }
};
