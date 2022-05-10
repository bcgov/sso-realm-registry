import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useForm } from 'react-hook-form';
import OverlayTrigger, { OverlayTriggerType } from 'react-bootstrap/OverlayTrigger';
import Popover from 'react-bootstrap/Popover';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconDefinition, faInfoCircle, faEnvelope } from '@fortawesome/free-solid-svg-icons';
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

const LeftMargin = styled.span`
  margin-left: 2px;
`;

const InfoPopover = ({
  icon = faInfoCircle,
  trigger = ['hover', 'focus'],
  children,
}: {
  icon?: IconDefinition;
  trigger?: OverlayTriggerType[];
  children: React.ReactNode;
}) => {
  return (
    <OverlayTrigger
      trigger={trigger}
      placement="right-start"
      overlay={
        <Popover id="popover-basic">
          <Popover.Body>{children}</Popover.Body>
        </Popover>
      }
      delay={{ show: 200, hide: 200 }}
    >
      <LeftMargin>
        <FontAwesomeIcon color="#777777" icon={icon} />
      </LeftMargin>
    </OverlayTrigger>
  );
};

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
        content: 'Realm profile has been updated successfully',
      });
    }
  };

  const isAdmin = currentUser.client_roles.includes('sso-admin');
  const isPO = currentUser.idir_username.toLocaleLowerCase() === realm.product_owner_idir_userid.toLocaleLowerCase();

  if (!realm) return null;

  const values = getValues();
  return (
    <>
      <h2>Realm Name: {realm.realm}</h2>
      <form onSubmit={handleSubmit(onSubmit)}>
        <label htmlFor="displayName">
          Realm Descriptive Name
          <InfoPopover>This name is the name you've configured in custom realm setting</InfoPopover>
        </label>
        <input
          type="text"
          placeholder="Realm Descriptive Name"
          disabled
          {...register('displayName', { required: false, minLength: 2, maxLength: 1000 })}
        />
        <label htmlFor="product_name">
          Product Name<span className="required">*</span>
          <InfoPopover>Help us understand what product this realm is tied to</InfoPopover>
        </label>
        <input
          type="text"
          placeholder="Product Name"
          {...register('product_name', { required: false, minLength: 2, maxLength: 1000 })}
        />
        <label htmlFor="openshift_namespace">
          Openshift Namespace<span className="required">*</span>
          <InfoPopover>
            If this realm is tied to OS, provide the license plate, if this realm is shared with multiple products type{' '}
            <strong>Various</strong>. If OS is not applicable, please help type <strong>NA</strong>
          </InfoPopover>
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
                    placeholder="<Please enter the ministry name>"
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
                    placeholder="<Please enter the division name>"
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
                    placeholder="<Please enter the branch name>"
                    {...register('branch_other', { required: true, minLength: 2, maxLength: 1000 })}
                  />
                )}
              </>
            )}
          </>
        )}
        <label htmlFor="product_owner_email">
          Product Owner Email<span className="required">*</span>
          <InfoPopover>If not dithered, you can update this field with the appropriate product owner email</InfoPopover>
        </label>
        <input
          type="text"
          placeholder="Product Owner Email"
          disabled={!isAdmin && !isPO}
          {...register('product_owner_email', { required: false, pattern: /^\S+@\S+$/i })}
        />
        <label htmlFor="product_owner_idir_userid">
          Product Owner Idir
          <InfoPopover>
            If not dithered, you can update this field with the appropriate product owner Idir
            <br />
          </InfoPopover>
          &nbsp;
          <InfoPopover icon={faEnvelope} trigger={['click']}>
            Please contact{' '}
            <span className="underline">
              <a href="mailto:bcgov.sso@gov.bc.ca">Pathfinder SSO Team</a>
            </span>{' '}
            if you want to transfer the product owner of this realm
            <br />
          </InfoPopover>
        </label>
        <input
          type="text"
          placeholder="Product Owner Idir"
          disabled={!isAdmin}
          {...register('product_owner_idir_userid', { required: false, minLength: 2, maxLength: 1000 })}
        />
        <label htmlFor="technical_contact_email">
          Technical Contact Email<span className="required">*</span>
          <InfoPopover>
            If not dithered, you can update this field with the appropriate technical contact email
          </InfoPopover>
        </label>
        <input
          type="text"
          placeholder="Technical Contact Email"
          {...register('technical_contact_email', { required: false, pattern: /^\S+@\S+$/i })}
        />
        <label htmlFor="technical_contact_idir_userid">
          Technical Contact Idir
          <InfoPopover>
            If not dithered, you can update this field with the appropriate technical contact Idir
          </InfoPopover>
        </label>
        <input
          type="text"
          placeholder="Technical Contact Idir"
          disabled={!isAdmin && !isPO}
          {...register('technical_contact_idir_userid', { required: false, minLength: 2, maxLength: 1000 })}
        />
        <label htmlFor="second_technical_contact_email">
          Second Technical Contact Email(optional)<span className="required">*</span>
          <InfoPopover>
            If not dithered, you can update this field with the appropriate optional technical contact email
          </InfoPopover>
        </label>
        <input
          type="text"
          placeholder="Second Technical Contact Email"
          {...register('second_technical_contact_email', { required: false, pattern: /^\S+@\S+$/i })}
        />
        <label htmlFor="second_technical_contact_idir_userid">
          Second Technical Contact Idir(optional)
          <InfoPopover>
            If not dithered, you can update this field with the appropriate optional technical contact Idir
          </InfoPopover>
        </label>
        <input
          type="text"
          placeholder="Second Technical Contact Idir"
          disabled={!isAdmin && !isPO}
          {...register('second_technical_contact_idir_userid', { required: false, minLength: 2, maxLength: 1000 })}
        />
        {isAdmin && (
          <>
            {/* ADMIN NOTE 1 */}
            <label htmlFor="admin_note_1">Admin Note 1</label>
            <textarea
              rows={6}
              placeholder="Admin Note 1"
              disabled={!isAdmin && !isPO}
              {...register('admin_note_1', { required: false, minLength: 2, maxLength: 2000 })}
            />
            {/* ADMIN NOTE 2 */}
            <label htmlFor="admin_note_2">Admin Note 2</label>
            <textarea
              rows={6}
              placeholder="Admin Note 2"
              disabled={!isAdmin && !isPO}
              {...register('admin_note_2', { required: false, minLength: 2, maxLength: 2000 })}
            />
            {/* Next Step */}
            <label htmlFor="next_steps">Next Step</label>
            <textarea
              rows={6}
              placeholder="Next Step"
              disabled={!isAdmin && !isPO}
              {...register('next_steps', { required: false, minLength: 2, maxLength: 2000 })}
            />
            {/* Material To Send */}
            <label htmlFor="material_to_send">Material To Send</label>
            <textarea
              rows={6}
              placeholder="Material To Send"
              disabled={!isAdmin && !isPO}
              {...register('material_to_send', { required: false, minLength: 2, maxLength: 2000 })}
            />
          </>
        )}
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
