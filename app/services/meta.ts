import { instance } from './axios';
import { Ministry } from 'types/realm-profile';

export const getMinistries = async (): Promise<[Ministry[], null] | [null, any]> => {
  try {
    const result = await instance.get('meta/ministry').then((res) => res.data);
    return [result as Ministry[], null];
  } catch (err: any) {
    console.error(err);
    return [null, err];
  }
};

export const getDivisions = async (ministry: string): Promise<[string[], null] | [null, any]> => {
  try {
    const result = await instance.post(`meta/division`, { ministry }).then((res) => res.data);
    return [result as string[], null];
  } catch (err: any) {
    console.error(err);
    return [null, err];
  }
};

export const getBranches = async (ministry: string, division: string): Promise<[string[], null] | [null, any]> => {
  try {
    const result = await instance.post(`meta/branch`, { ministry, division }).then((res) => res.data);
    return [result as string[], null];
  } catch (err: any) {
    console.error(err);
    return [null, err];
  }
};
