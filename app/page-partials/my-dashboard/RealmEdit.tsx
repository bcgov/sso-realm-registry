import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import OverlayTrigger, { OverlayTriggerType } from 'react-bootstrap/OverlayTrigger';
import Popover from 'react-bootstrap/Popover';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconDefinition, faInfoCircle, faEnvelope } from '@fortawesome/free-solid-svg-icons';
import { Grid as SpinnerGrid } from 'react-loader-spinner';
import Button from '@button-inc/bcgov-theme/Button';
import { withBottomAlert, BottomAlert } from 'layout/BottomAlert';
import { getRealmProfile, updateRealmProfile } from 'services/realm';
import { getMinistries, getDivisions, getBranches } from 'services/meta';
import { UserSession } from 'types/user-session';
import styled from 'styled-components';
import { RealmProfile } from 'types/realm-profile';
import { getListOfMinistries } from 'utils/helpers';

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
  const [ministries, setMinistries] = useState<any>([]);
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
    setMinistries(data || []);
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

  const onSubmit = async (formData: any) => {
    const [data, err] = await updateRealmProfile(String(realm.id), formData as RealmProfile);
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

  const isAdmin = currentUser?.client_roles?.includes('sso-admin');
  const isPO = currentUser?.idir_username.toLowerCase() === realm?.productOwnerIdirUserId.toLowerCase();

  if (!realm) return null;

  const values = getValues();
  return (
    <>
      <h2>Realm Name: {realm.realm}</h2>
      <form onSubmit={handleSubmit(onSubmit)}>
        <label htmlFor="displayName">
          Realm
          <InfoPopover>Name of the realm you&apos;ve configured in custom realm setting</InfoPopover>
        </label>
        <input
          type="text"
          placeholder="Realm Name"
          disabled
          {...register('realm', { required: false, minLength: 2, maxLength: 1000 })}
        />
        <label htmlFor="productName">
          Product Name<span className="required">*</span>
          <InfoPopover>Help us understand what product this realm is tied to</InfoPopover>
        </label>
        <input
          type="text"
          placeholder="Product Name"
          {...register('productName', { required: true, minLength: 2, maxLength: 1000 })}
        />
        <label htmlFor=""></label>
        {loading ? (
          <AlignCenter>
            <SpinnerGrid color="#000" height={45} width={45} wrapperClass="d-block" visible={loading} />
          </AlignCenter>
        ) : (
          <>
            {ministries.length > 0 && (
              <>
                <label htmlFor="ministry">
                  Ministry<span className="required">*</span>
                </label>
                <select {...register('ministry')}>
                  {ministries.map((ministry: any) => (
                    <option value={ministry?.title} key={ministry?.id}>
                      {ministry?.title}
                    </option>
                  ))}
                </select>
                {values?.ministry === 'Other' && (
                  <input
                    type="text"
                    placeholder="<Please enter the ministry name>"
                    {...register('ministryOther', { required: true, minLength: 2, maxLength: 1000 })}
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
                    <option value={division} key={Math.random() * 120}>
                      {division}
                    </option>
                  ))}
                </select>
                {values?.division === 'Other' && (
                  <input
                    type="text"
                    placeholder="<Please enter the division name>"
                    {...register('divisionOther', { required: true, minLength: 2, maxLength: 1000 })}
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
                    <option value={branch} key={Math.random() * 120}>
                      {branch}
                    </option>
                  ))}
                </select>
                {values?.branch === 'Other' && (
                  <input
                    type="text"
                    placeholder="<Please enter the branch name>"
                    {...register('branchOther', { required: true, minLength: 2, maxLength: 1000 })}
                  />
                )}
              </>
            )}
          </>
        )}
        <label htmlFor="productOwnerEmail">
          Product Owner Email<span className="required">*</span>
          <InfoPopover>If not dithered, you can update this field with the appropriate product owner email</InfoPopover>
        </label>
        <input
          type="text"
          placeholder="Product Owner Email"
          disabled={!isAdmin && !isPO}
          {...register('productOwnerEmail', { required: true, pattern: /^\S+@\S+$/i })}
        />
        <label htmlFor="productOwnerIdirUserId">
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
          {...register('productOwnerIdirUserId', { required: false, minLength: 2, maxLength: 1000 })}
        />
        <label htmlFor="technicalContactEmail">
          Technical Contact Email<span className="required">*</span>
          <InfoPopover>
            If not dithered, you can update this field with the appropriate technical contact email
          </InfoPopover>
        </label>
        <input
          type="text"
          placeholder="Technical Contact Email"
          {...register('technicalContactEmail', { required: true, pattern: /^\S+@\S+$/i })}
        />
        <label htmlFor="technicalContactIdirUserId">
          Technical Contact Idir<span className="required">*</span>
          <InfoPopover>
            If not dithered, you can update this field with the appropriate technical contact Idir
          </InfoPopover>
        </label>
        <input
          type="text"
          placeholder="Technical Contact Idir"
          disabled={!isAdmin && !isPO}
          {...register('technicalContactIdirUserId', { required: true, minLength: 2, maxLength: 1000 })}
        />
        <label htmlFor="secondTechnicalContactEmail">
          Second Technical Contact Email(optional)
          <InfoPopover>
            If not dithered, you can update this field with the appropriate optional technical contact email
          </InfoPopover>
        </label>
        <input
          type="text"
          placeholder="Second Technical Contact Email"
          {...register('secondTechnicalContactEmail', { required: false, pattern: /^\S+@\S+$/i })}
        />
        <label htmlFor="secondTechnicalContactIdirUserId">
          Second Technical Contact Idir(optional)
          <InfoPopover>
            If not dithered, you can update this field with the appropriate optional technical contact Idir
          </InfoPopover>
        </label>
        <input
          type="text"
          placeholder="Second Technical Contact Idir"
          disabled={!isAdmin && !isPO}
          {...register('secondTechnicalContactIdirUserId', { required: false, minLength: 2, maxLength: 1000 })}
        />
        {isAdmin && (
          <>
            {/* Rocket.Chat Channel */}
            <label htmlFor="rcChannel">Rocket.Chat Channel</label>
            <input
              type="text"
              placeholder="Rocket.Chat Channel"
              disabled={!isAdmin && !isPO}
              {...register('rcChannel', { required: false, minLength: 2, maxLength: 2000 })}
            />
            {/* Rocket.Chat Channel Owner */}
            <label htmlFor="rcChannelOwnedBy">Rocket.Chat Channel Owner</label>
            <input
              type="text"
              placeholder="Rocket.Chat Channel Owner"
              disabled={!isAdmin && !isPO}
              {...register('rcChannelOwnedBy', { required: false, minLength: 2, maxLength: 2000 })}
            />
            {/* Material To Send */}
            <label htmlFor="materialToSend">Material To Send</label>
            <textarea
              rows={6}
              placeholder="Material To Send"
              disabled={!isAdmin && !isPO}
              {...register('materialToSend', { required: false, minLength: 2, maxLength: 2000 })}
            />
          </>
        )}
        {realm && <p>Last Updated: {new Date(realm?.updatedAt).toLocaleString()}</p>}
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
