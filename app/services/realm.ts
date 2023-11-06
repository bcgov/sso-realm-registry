import { instance } from './axios';
import { RealmProfile, ModalData } from 'types/realm-profile';
import { CustomRealmFormData } from 'types/realm-profile'

export const getRealmProfiles = async (): Promise<[RealmProfile[], null] | [null, any]> => {
  try {
    const result = await instance.get('realms/all').then((res) => res.data);
    return [result as RealmProfile[], null];
  } catch (err: any) {
    console.error(err);
    return [null, err];
  }
};

export const getRealmProfile = async (id: string): Promise<[RealmProfile, null] | [null, any]> => {
  try {
    const result = await instance.get(`realms/one?id=${id}`).then((res) => res.data);
    return [result as RealmProfile, null];
  } catch (err: any) {
    console.error(err);
    return [null, err];
  }
};

export const updateRealmProfile = async (id: string, data: RealmProfile): Promise<[any, null] | [null, any]> => {
  try {
    const result = await instance.put(`realms/one?id=${id}`, data).then((res) => res.data);
    return [result as RealmProfile, null];
  } catch (err: any) {
    console.error(err);
    return [null, err];
  }
};

export const submitRealmRequest = async (realmInfo: CustomRealmFormData) => {
  try {
    const result = await instance.post(`realms/request`, realmInfo).then((res) => res.data);
    return [result, null]
  } catch (err: any) {
    console.error(err);
    return [null, err];
  }
}

export const deleteRealmRequest = async (realmId: number) => {
  try {
    const result = await instance.delete(`realms/request/${realmId}`).then((res) => res.data);
    return [result, null]
  } catch (err: any) {
    console.error(err);
    return [null, err];
  }
}

export const updateRealmRequestStatus = async (realmId: number, realmStatus: 'approved' | 'declined') => {
  try {
    const result = await instance.put(`realms/request/${realmId}`, {status: realmStatus}).then((res) => res.data);
    return [result, null]
  } catch (err: any) {
    console.error(err);
    return [null, err];
  }
}
