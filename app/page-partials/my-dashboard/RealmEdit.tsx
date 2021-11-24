import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useForm } from 'react-hook-form';
import Loader from 'react-loader-spinner';
import ResponsiveContainer, { MediaRule } from 'components/ResponsiveContainer';
import Button from '@button-inc/bcgov-theme/Button';
import Checkbox from '@button-inc/bcgov-theme/Checkbox';
import { withBottomAlert, BottomAlert } from 'layout/BottomAlert';
import { getRealmProfile, updateRealmProfile } from 'services/realm';
import { getMinistries, getDivisions, getBranches } from 'services/meta';
import { UserSession } from 'types/user-session';
import styled from 'styled-components';
import { RealmProfile } from 'types/realm-profile';

const AlignCenter = styled.div`
  text-align: center;
`;

interface Props {
  alert: BottomAlert;
  realm: RealmProfile;
  currentUser: UserSession;
  onUpdate: (realm: RealmProfile) => void;
  onCancel: () => void;
}

let time = 0;
setInterval(() => {
  time++;
}, 1000);

function RealmTable({ alert, realm, currentUser, onUpdate, onCancel }: Props) {
  const [ministries, setMinistries] = useState<string[]>([]);
  const [divisions, setDivisions] = useState<string[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(false);
  const [, updateState] = useState(0);
  const forceUpdate = useCallback(() => updateState((tick) => tick + 1), []);

  const { register, handleSubmit, setValue, getValues, watch, reset, formState } = useForm();

  const updateRealm = (profile: RealmProfile) => {
    const keys = Object.keys(profile);
    for (let x = 0; x < keys.length; x++) {
      const key = keys[x];
      setValue(key, profile[key]);
    }

    setInitialLoad(true);
  };

  const loadBranches = async (value: any) => {
    setLoading(true);
    const [data, err] = await getBranches(value?.ministry, value?.division);

    if (err) setBranches([]);
    else {
      const list = data || [];
      const first = list.length > 0 ? list[0] : null;
      const oldval = value?.branch;
      let newval = list.includes(oldval) ? oldval : first;
      if (oldval !== newval) setValue('branch', newval);
      else forceUpdate();
      setBranches(list);
    }

    setLoading(false);
  };

  const loadDivisions = async (value: any) => {
    setLoading(true);
    const [data, err] = await getDivisions(value?.ministry);

    if (err) setDivisions([]);
    else {
      const list = data || [];
      const first = list.length > 0 ? list[0] : null;
      const oldval = value?.division;
      let newval = list.includes(value?.division) ? value?.division : first;
      if (oldval !== newval) setValue('division', newval);
      else await loadBranches(value);
      setDivisions(list);
    }

    setLoading(false);
  };

  const loadMinistries = async () => {
    setLoading(true);
    const [data, err] = await getMinistries();
    if (err) setMinistries([]);
    else setMinistries(data || []);
    setLoading(false);
  };

  useEffect(() => {
    let subscription: any = null;

    if (initialLoad) {
      subscription = watch((value, { name, type }) => {
        if (name === 'ministry') {
          loadDivisions(value);
        } else if (name === 'division') {
          loadBranches(value);
        } else if (name === 'branch') {
          forceUpdate();
        }
      });

      setValue('ministry', getValues().ministry);
    }

    return () => subscription && subscription.unsubscribe();
  }, [watch, initialLoad]);

  useEffect(() => {
    const fn = async () => {
      await loadMinistries();
      updateRealm(realm);
    };

    fn();
  }, [realm]);

  const onSubmit = async (formData: RealmProfile) => {
    const [data, err] = await updateRealmProfile(realm.id, formData);
    if (!err) {
      onUpdate(data as RealmProfile);

      alert.show({
        variant: 'success',
        fadeOut: 2500,
        closable: true,
        content: 'Realm profile hass been updated successfully',
      });
    }
  };

  const isPO = currentUser.idir_userid.toLocaleLowerCase() === realm.product_owner_idir_userid.toLocaleLowerCase();

  if (!realm) return null;

  const values = getValues();

  return (
    <>
      <h2>Realm Name: {realm.realm}</h2>
      <form onSubmit={handleSubmit(onSubmit)}>
        <label htmlFor="displayName">Realm Descriptive Name</label>
        <input
          type="text"
          placeholder="Realm Descriptive Name"
          disabled
          {...register('displayName', { required: false, minLength: 2, maxLength: 1000 })}
        />
        <label htmlFor="product_name">
          Product Name<span className="required">*</span>
        </label>
        <input
          type="text"
          placeholder="Product Name"
          {...register('product_name', { required: false, minLength: 2, maxLength: 1000 })}
        />
        <label htmlFor="openshift_namespace">
          Openshift Namespace<span className="required">*</span>
        </label>
        <input
          type="text"
          placeholder="Openshift Namespace"
          {...register('openshift_namespace', { required: false, minLength: 2, maxLength: 1000 })}
        />
        {loading ? (
          <AlignCenter>
            <Loader type="Grid" color="#000" height={45} width={45} visible={loading} />
          </AlignCenter>
        ) : (
          <>
            {ministries.length > 0 && (
              <>
                <label htmlFor="ministry">
                  Ministry<span className="required">*</span>
                </label>
                <select {...register('ministry')}>
                  {ministries.map((ministry) => (
                    <option value={ministry}>{ministry}</option>
                  ))}
                </select>
                {values?.ministry === 'Other' && (
                  <input
                    type="text"
                    placeholder="Ministry"
                    {...register('ministry_other', { required: true, minLength: 2, maxLength: 1000 })}
                  />
                )}
              </>
            )}
            {divisions.length > 0 && (
              <>
                <label htmlFor="division">
                  Division<span className="required">*</span>
                </label>
                <select {...register('division')}>
                  {divisions.map((division) => (
                    <option value={division}>{division}</option>
                  ))}
                </select>
                {values?.division === 'Other' && (
                  <input
                    type="text"
                    placeholder="Division"
                    {...register('division_other', { required: true, minLength: 2, maxLength: 1000 })}
                  />
                )}
              </>
            )}
            {branches.length > 0 && (
              <>
                <label htmlFor="branch">
                  Branch<span className="required">*</span>
                </label>
                <select {...register('branch')}>
                  {branches.map((branch) => (
                    <option value={branch}>{branch}</option>
                  ))}
                </select>
                {values?.branch === 'Other' && (
                  <input
                    type="text"
                    placeholder="Branch"
                    {...register('branch_other', { required: true, minLength: 2, maxLength: 1000 })}
                  />
                )}
              </>
            )}
          </>
        )}
        <label htmlFor="product_owner_email">
          Product Owner Email<span className="required">*</span>
        </label>
        <input
          type="text"
          placeholder="Product Owner Email"
          disabled={!isPO}
          {...register('product_owner_email', { required: false, pattern: /^\S+@\S+$/i })}
        />
        <label htmlFor="product_owner_idir_userid">Product Owner Idir</label>
        <input
          type="text"
          placeholder="Product Owner Idir"
          disabled
          {...register('product_owner_idir_userid', { required: false, minLength: 2, maxLength: 1000 })}
        />
        <label htmlFor="technical_contact_email">
          Technical Contact Email<span className="required">*</span>
        </label>
        <input
          type="text"
          placeholder="Technical Contact Email"
          {...register('technical_contact_email', { required: false, pattern: /^\S+@\S+$/i })}
        />
        <label htmlFor="technical_contact_idir_userid">Technical Contact Idir</label>
        <input
          type="text"
          placeholder="Technical Contact Idir"
          disabled={!isPO}
          {...register('technical_contact_idir_userid', { required: false, minLength: 2, maxLength: 1000 })}
        />
        {realm && <p>Last Updated: {new Date(realm.updated_at).toLocaleString()}</p>}
        <Button type="submit" variant="primary">
          Save
        </Button>
        &nbsp;
        <Button type="button" variant="primary-inverse" onClick={onCancel}>
          Cancel
        </Button>
      </form>
    </>
  );
}

export default withBottomAlert(RealmTable);
