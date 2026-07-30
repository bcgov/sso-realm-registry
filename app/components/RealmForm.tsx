import { CustomRealmFormData, PrimaryEndUser, RealmMember } from 'types/realm-profile';
import styled from 'styled-components';
import React, { useState, ChangeEvent, useEffect, Dispatch, SetStateAction } from 'react';
import { Grid as SpinnerGrid } from 'react-loader-spinner';
import { ValidationError } from 'yup';
import { cloneDeep, kebabCase, debounce } from 'lodash';
import { getMinistries, getDivisions, getBranches } from 'services/meta';
import InfoPopover from 'components/InfoPopover';
import { Ministry } from 'types/realm-profile';
import * as yup from 'yup';
import AsyncSelect from 'react-select/async';
import { getIdirUsersByEmail } from 'services/azure';
import { realmTakenError } from 'pages/custom-realm-form';
import { MAX_ADDITIONAL_USERS } from 'utils/constants';

const SForm = styled.form<{ collapse: boolean }>`
  display: grid;
  grid-template-columns: ${(props) => (props.collapse ? '1fr' : '1fr 1fr')};
  column-gap: 2em;
  row-gap: 1em;
  font-size: 16px;

  .error-message {
    color: red;
    padding: 0;
    margin: 0;
  }

  .first-col {
    grid-column: 1;
  }

  .second-col {
    grid-column: ${(props) => (props.collapse ? '1' : '2')};
  }

  .span-cols {
    grid-column: 1 / 3;
  }

  label,
  legend {
    &.required:after {
      content: ' *';
      color: red;
    }

    &.with-info svg {
      margin: 0 0.3em;
    }
  }

  legend {
    font-weight: 700;
  }

  fieldset {
    border: 0;
    legend {
      font-size: 16px;
      margin-bottom: 16px;
    }
  }

  .input-wrapper {
    display: flex;
    flex-direction: column;
  }

  .checkbox-wrapper,
  .radio-wrapper {
    input {
      display: inline-block;
      width: auto;
      flex-grow: 0;
      margin-right: 0.5em;
    }
    label {
      display: inline-block;
    }
  }

  .checkbox-wrapper.with-textarea {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;

    input {
      margin-top: 0.2em;
    }

    .textarea-container {
      margin-left: 1em;
      flex: 1;
      textarea {
        width: 100%;
      }

      .help-text {
        color: grey;
        text-align: right;
        margin: 0;
      }
    }
  }

  .grid {
    display: grid;
    grid-template-columns: ${(props) => (props.collapse ? '1fr' : '1fr 1fr')};
    column-gap: 2em;
    row-gap: 1em;
  }

  label {
    font-weight: 700;
  }

  input,
  select,
  textarea {
    scroll-margin-top: 1em;
    border: 2px solid #606060;
    border-radius: 0.25em;
    padding: 0.5em 0.6em;
    &:focus {
      outline: 4px solid #3b99fc;
      outline-offset: 1px;
    }
    &:disabled {
      background: #dddddd;
    }
  }

  .additional-user-row {
    display: grid;
    grid-template-columns: ${(props) => (props.collapse ? '1fr' : '1fr 1fr auto')};
    column-gap: 2em;
    row-gap: 0.5em;
    align-items: end;
    margin-bottom: 1em;
  }

  .remove-user-button,
  .add-user-button {
    width: auto;
    padding: 0.5em 1em;
  }

  .help-text {
    color: grey;
    margin: 0;
  }
`;

const ButtonContainer = styled.div`
  width: 100%;
  display: flex;
  justify-content: space-between;
  padding-top: 1em;
  gap: 1em;
  button {
    width: 8em;
  }
`;

const validateForm = (data: CustomRealmFormData, validationSchema: yup.AnyObjectSchema) => {
  try {
    validationSchema.validateSync(data, { abortEarly: false, stripUnknown: true });
    return { valid: true, errors: null };
  } catch (e) {
    const err = e as ValidationError;
    const formErrors: { [key in keyof CustomRealmFormData]?: boolean } = {};
    let firstError = '';
    err.errors.forEach((error, i) => {
      // Yup error strings begin with object key
      const fieldName = error.split(' ')[0] as keyof CustomRealmFormData;
      if (i === 0) firstError = fieldName;
      formErrors[fieldName] = true;
    });
    // Scroll error into view if found
    try {
      const firstFieldInputId = `${kebabCase(firstError)}-input`;
      const firstErrorInput = document.querySelector(`#${firstFieldInputId}`);
      if (firstErrorInput) {
        firstErrorInput.scrollIntoView();
      }
    } catch (e) {}
    return { valid: false, errors: formErrors };
  }
};

interface Props {
  formData: CustomRealmFormData;
  setFormData: Dispatch<SetStateAction<CustomRealmFormData>> | Dispatch<SetStateAction<CustomRealmFormData | null>>;
  onSubmit: (data: CustomRealmFormData) => Promise<void>;
  onCancel: () => void;
  isAdmin?: boolean;
  isPO?: boolean;
  validationSchema: yup.AnyObjectSchema;
  collapse: boolean;
  updatedMessage?: string;
}

const requiredEmailMessage = 'Fill this in with a proper email.';
const twoCharactersRequiredMessage = 'This field must be at least two characters.';

const defaultUserOptions = ['livingInBC', 'businessInBC', 'govEmployees'];
const hasOtherPrimaryEndUsers = (primaryEndUsers: PrimaryEndUser[]) =>
  primaryEndUsers.some((user) => !defaultUserOptions.includes(user));

const otherPrimaryEndUser = (primaryEndUsers: PrimaryEndUser[]) => {
  const hasOther = hasOtherPrimaryEndUsers(primaryEndUsers);
  if (hasOther) return primaryEndUsers.filter((user) => !defaultUserOptions.includes(user))[0];
  else return '';
};

const memberKey = (member: RealmMember | null) =>
  member?.azureId ?? (member?.userId != null ? `user:${member.userId}` : null);

/**
 * Best effort duplicate check. The server repeats it against resolved identities, which
 * is what catches the same person picked freshly in one slot and already stored in another.
 */
const findDuplicateMember = (data: CustomRealmFormData) => {
  const members = [data.productOwner, data.technicalLead, ...data.additionalUsers];
  const seen = new Set<string>();

  for (const member of members) {
    const key = memberKey(member);
    if (!key) continue;
    if (seen.has(key)) return member?.email || member?.idirUsername || 'That user';
    seen.add(key);
  }

  return null;
};

export default function RealmForm({
  onSubmit,
  formData,
  setFormData,
  validationSchema,
  onCancel,
  updatedMessage,
  collapse = false,
}: Props) {
  // Keyed by yup error path, so additional user rows appear as `additionalUsers[0]`.
  const [formErrors, setFormErrors] = useState<{ [key: string]: boolean | string | undefined }>({});
  const [otherPrimaryEndUsersSelected, setOtherPrimaryEndUsersSelected] = useState(
    hasOtherPrimaryEndUsers(formData.primaryEndUsers),
  );
  const [otherPrimaryEndUserDetails, setOtherPrimaryEndUserDetails] = useState(
    otherPrimaryEndUser(formData.primaryEndUsers),
  );
  const [submittingForm, setSubmittingForm] = useState(false);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [divisions, setDivisions] = useState<string[]>([]);
  const [branches, setBranches] = useState<string[]>([]);

  // The search already returns the IDIR username, so a selection needs no follow up call.
  const fuzzySearchIdirUsersByEmail = debounce((email: string, cb) => {
    if (email.length > 2) {
      getIdirUsersByEmail(email).then(([data, err]) => {
        if (err) return cb([]);
        const options = data?.map((u) => {
          return {
            value: u.id,
            label: u.mail,
            idirUsername: u.onPremisesSamAccountName || u.mailNickname || '',
          };
        });
        cb(options);
      });
    } else {
      cb([]);
    }
  }, 300);

  /** Only the Azure object id is sent on save; the server re-resolves everything else. */
  const optionToMember = (option: any): RealmMember | null =>
    option?.value
      ? { azureId: option.value, email: option.label ?? '', idirUsername: option.idirUsername ?? '' }
      : null;

  const memberToOption = (member: RealmMember | null) =>
    member?.email ? { value: member.azureId ?? String(member.userId ?? ''), label: member.email } : undefined;

  const handleMemberChange = (option: any, slot: 'productOwner' | 'technicalLead') => {
    setFormErrors({ ...formErrors, [slot]: false });
    setFormData({ ...formData, [slot]: optionToMember(option) });
  };

  const handleAdditionalUserChange = (option: any, index: number) => {
    const additionalUsers = [...formData.additionalUsers];
    additionalUsers[index] = optionToMember(option);
    setFormErrors({ ...formErrors, [`additionalUsers[${index}]`]: false, additionalUsers: false });
    setFormData({ ...formData, additionalUsers });
  };

  const addAdditionalUser = () => {
    if (formData.additionalUsers.length >= MAX_ADDITIONAL_USERS) return;
    setFormData({ ...formData, additionalUsers: [...formData.additionalUsers, null] });
  };

  const removeAdditionalUser = (index: number) => {
    setFormErrors({});
    setFormData({ ...formData, additionalUsers: formData.additionalUsers.filter((_, i) => i !== index) });
  };

  const handleFormInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormErrors({ ...formErrors, [e.target.name]: false });
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFormCheckboxGroupChange = (e: ChangeEvent<HTMLInputElement>, groupName: 'primaryEndUsers') => {
    setFormErrors({ ...formErrors, [groupName]: false });
    let newData = { ...formData };
    if (e.target.checked && !formData[groupName].includes(e.target.value)) {
      newData = { ...formData, [groupName]: [...formData[groupName], e.target.name] };
    } else {
      newData = { ...formData, [groupName]: formData[groupName].filter((val) => val !== e.target.name) };
    }
    setFormData(newData);
  };

  const handleSubmit = () => {
    const submission = cloneDeep(formData);
    // Update primary users
    submission.primaryEndUsers = submission.primaryEndUsers.filter((user) => defaultUserOptions.includes(user));
    if (otherPrimaryEndUsersSelected) {
      submission.primaryEndUsers.push(otherPrimaryEndUserDetails);
    }
    // Rows that were added but never filled in are simply not part of the submission.
    submission.additionalUsers = submission.additionalUsers.filter(Boolean);

    const { valid, errors } = validateForm(submission, validationSchema);
    if (!valid) {
      setFormErrors(errors as any);
      return;
    }

    const duplicate = findDuplicateMember(submission);
    if (duplicate) {
      setFormErrors({ additionalUsers: `${duplicate} cannot occupy more than one membership slot.` });
      try {
        document.getElementById('additional-users-section')?.scrollIntoView();
      } catch (e) {}
      return;
    }
    setSubmittingForm(true);
    onSubmit(submission)
      .catch((err) => {
        if (err.message === realmTakenError) {
          setFormErrors({ realm: 'Realm Name taken.' });
          document.getElementById('realm-input')?.scrollIntoView();
        }
      })
      .then(() => setSubmittingForm(false));
  };

  const loadBranches = async (division: string = 'Other') => {
    const [data, err] = await getBranches(formData?.ministry as string, division);
    if (err) setBranches([]);
    else {
      setBranches(data || []);
    }
  };

  const loadDivisions = async (ministry: string) => {
    const [data, err] = await getDivisions(ministry);
    if (err) setDivisions([]);
    else {
      setDivisions(data || []);
    }
  };

  const loadMinistries = async () => {
    const [data] = await getMinistries();
    setMinistries((data as Ministry[]) || []);
  };

  useEffect(() => {
    loadMinistries();
  }, []);

  useEffect(() => {
    if (formData.ministry) {
      loadDivisions(formData?.ministry as string);
    }
  }, [formData.ministry]);

  useEffect(() => {
    if (formData.division) {
      loadBranches(formData.division as string);
    }
  }, [formData.division]);

  const schemaFields = Object.keys(validationSchema.fields);
  // Membership is shared between the product owner and technical lead, so it is in the
  // schema for every role that can reach this form.
  const membershipEditable = schemaFields.includes('productOwner');

  return (
    <>
      <SForm collapse={collapse}>
        <div className="input-wrapper first-col">
          <label htmlFor="realm-input" className="required with-info">
            Custom Realm name
            <InfoPopover>The realm name. Can only include letters, underscores and hypens.</InfoPopover>
          </label>
          <input
            required
            id="realm-input"
            name="realm"
            onChange={handleFormInputChange}
            value={formData.realm}
            disabled={!schemaFields.includes('realm')}
            maxLength={36}
          />
          {formErrors.realm && (
            <p className="error-message">
              {typeof formErrors.realm === 'string'
                ? formErrors.realm
                : 'Realm name should contain only letters, underscores and hypens'}
            </p>
          )}
        </div>

        <div className="input-wrapper second-col">
          <label htmlFor="product-name-input" className="with-info required">
            Product Name
            <InfoPopover>Help us understand what product this realm is tied to</InfoPopover>
          </label>
          <input
            id="product-name-input"
            name="productName"
            onChange={handleFormInputChange}
            value={formData.productName}
            disabled={!schemaFields.includes('productName')}
          />
          {formErrors.productName && <p className="error-message">{twoCharactersRequiredMessage}</p>}
        </div>

        <div className="input-wrapper first-col">
          <label htmlFor="ministry">Ministry</label>
          <input
            list="ministry-list"
            id="ministry"
            name="ministry"
            disabled={!schemaFields.includes('ministry')}
            value={formData.ministry}
            onChange={handleFormInputChange}
          />

          <datalist id="ministry-list">
            {ministries.map((ministry: Ministry) => (
              <option value={ministry.title} key={ministry.id}>
                {ministry.title}
              </option>
            ))}
          </datalist>
        </div>

        <div className="input-wrapper second-col">
          <label htmlFor="division">Division</label>
          <input
            list="division-list"
            id="division"
            name="division"
            onChange={handleFormInputChange}
            disabled={!schemaFields.includes('division')}
            value={formData.division}
          />

          <datalist id="division-list">
            {divisions.map((division: string) => (
              <option value={division} key={division}>
                {division}
              </option>
            ))}
          </datalist>
        </div>

        <div className="input-wrapper first-col">
          <label htmlFor="branch">Branch</label>
          <input
            list="branch-list"
            id="branch"
            name="branch"
            onChange={handleFormInputChange}
            disabled={!schemaFields.includes('branch')}
            value={formData.branch}
          />

          <datalist id="branch-list">
            {branches.map((branch: any) => (
              <option value={branch} key={branch}>
                {branch}
              </option>
            ))}
          </datalist>
        </div>

        <div className="input-wrapper second-col">
          <label htmlFor="purpose-input" className="required with-info">
            Purpose of Realm
            <InfoPopover>What is this relams purpose?</InfoPopover>
          </label>
          <input
            required
            id="purpose-input"
            name="purpose"
            onChange={handleFormInputChange}
            value={formData.purpose}
            disabled={!schemaFields.includes('purpose')}
          />
          {formErrors.purpose && <p className="error-message">{twoCharactersRequiredMessage}</p>}
        </div>

        <fieldset className="span-cols" disabled={!schemaFields.includes('primaryEndUsers')}>
          <legend className="required">
            Who are the primary end users of your project/application? (select all that apply)
          </legend>
          {formErrors.primaryEndUsers && <p className="error-message">You must select one or more.</p>}
          <div className="grid">
            <div className="checkbox-wrapper">
              <input
                type="checkbox"
                id="living-in-bc-checkbox"
                name="livingInBC"
                onChange={(e) => handleFormCheckboxGroupChange(e, 'primaryEndUsers')}
                checked={formData.primaryEndUsers.includes('livingInBC')}
              />
              <label htmlFor="living-in-bc-checkbox">People living in BC</label>
            </div>

            <div className="checkbox-wrapper">
              <input
                type="checkbox"
                id="people-doing-business-checkbox"
                name="businessInBC"
                onChange={(e) => handleFormCheckboxGroupChange(e, 'primaryEndUsers')}
                checked={formData.primaryEndUsers.includes('businessInBC')}
              />
              <label htmlFor="people-doing-business-checkbox">People doing business/travel in BC</label>
            </div>

            <div className="checkbox-wrapper">
              <input
                type="checkbox"
                id="bc-gov-employees-checkbox"
                name="govEmployees"
                onChange={(e) => handleFormCheckboxGroupChange(e, 'primaryEndUsers')}
                checked={formData.primaryEndUsers.includes('govEmployees')}
              />
              <label htmlFor="bc-gov-employees-checkbox">BC Gov employees</label>
            </div>

            <div className="checkbox-wrapper with-textarea">
              <input
                type="checkbox"
                id="other-users-checkbox"
                name="other"
                onChange={(e) => {
                  setOtherPrimaryEndUsersSelected(!otherPrimaryEndUsersSelected);
                  if (!e.target.checked) setOtherPrimaryEndUserDetails('');
                }}
                checked={otherPrimaryEndUsersSelected}
              />
              <label htmlFor="other-users-checkbox">Other</label>
              <div className="textarea-container">
                <textarea
                  rows={3}
                  placeholder="Enter details"
                  name="otherDetails"
                  onChange={(e) => setOtherPrimaryEndUserDetails(e.target.value)}
                  disabled={!otherPrimaryEndUsersSelected}
                  value={otherPrimaryEndUserDetails}
                  maxLength={100}
                />
                <p className="help-text">100 Characters max.</p>
              </div>
            </div>
          </div>
        </fieldset>

        <div className="input-wrapper first-col">
          <label htmlFor="product-owner-input" className="required">
            Product owner&apos;s email
          </label>
          <AsyncSelect
            inputId="product-owner-input"
            name="productOwner"
            loadOptions={fuzzySearchIdirUsersByEmail}
            onChange={(e: any) => handleMemberChange(e, 'productOwner')}
            isClearable
            noOptionsMessage={() => 'Start typing email...'}
            value={memberToOption(formData.productOwner) ?? null}
            className="product-owner-email"
            classNamePrefix="product-owner-email"
            isDisabled={!membershipEditable}
          />

          {formErrors.productOwner && <p className="error-message">{requiredEmailMessage}</p>}
        </div>

        <div className="input-wrapper second-col">
          <label htmlFor="product-owner-idir-input" className="required">
            Product owner&apos;s IDIR
          </label>
          <input
            required
            id="product-owner-idir-input"
            data-testid="product-owner-idir"
            name="productOwnerIdirUsername"
            value={formData.productOwner?.idirUsername ?? ''}
            readOnly
            disabled
          />
        </div>

        <div className="input-wrapper first-col">
          <label htmlFor="technical-lead-input" className="required">
            Technical lead&apos;s email
          </label>
          <AsyncSelect
            inputId="technical-lead-input"
            name="technicalLead"
            loadOptions={fuzzySearchIdirUsersByEmail}
            onChange={(e: any) => handleMemberChange(e, 'technicalLead')}
            isClearable
            noOptionsMessage={() => 'Start typing email...'}
            value={memberToOption(formData.technicalLead) ?? null}
            className="technical-contact-email"
            classNamePrefix="technical-contact-email"
            isDisabled={!membershipEditable}
          />

          {formErrors.technicalLead && <p className="error-message">{requiredEmailMessage}</p>}
        </div>

        <div className="input-wrapper second-col">
          <label htmlFor="technical-lead-idir-input" className="required">
            Technical lead&apos;s IDIR
          </label>
          <input
            required
            data-testid="tech-contact-idir"
            id="technical-lead-idir-input"
            name="technicalLeadIdirUsername"
            value={formData.technicalLead?.idirUsername ?? ''}
            readOnly
            disabled
          />
        </div>

        <fieldset className="span-cols" id="additional-users-section" disabled={!membershipEditable}>
          <legend className="with-info">
            Additional users
            <InfoPopover>
              Everyone listed here gets the same realm admin access as the product owner and technical lead, but cannot
              edit this form.
            </InfoPopover>
          </legend>
          <p className="help-text">Optional. Up to {MAX_ADDITIONAL_USERS} people.</p>

          {typeof formErrors.additionalUsers === 'string' && (
            <p className="error-message">{formErrors.additionalUsers}</p>
          )}

          {formData.additionalUsers.map((additionalUser, index) => (
            <div className="additional-user-row" key={`additional-user-${index}`}>
              <div className="input-wrapper">
                <label htmlFor={`additional-user-${index}-input`}>Additional user {index + 1}&apos;s email</label>
                <AsyncSelect
                  inputId={`additional-user-${index}-input`}
                  name={`additionalUsers[${index}]`}
                  loadOptions={fuzzySearchIdirUsersByEmail}
                  onChange={(e: any) => handleAdditionalUserChange(e, index)}
                  isClearable
                  noOptionsMessage={() => 'Start typing email...'}
                  value={memberToOption(additionalUser) ?? null}
                  className={`additional-user-email additional-user-email-${index}`}
                  classNamePrefix="additional-user-email"
                />
                {formErrors[`additionalUsers[${index}]`] && <p className="error-message">{requiredEmailMessage}</p>}
              </div>

              <div className="input-wrapper">
                <label htmlFor={`additional-user-${index}-idir-input`}>Additional user {index + 1}&apos;s IDIR</label>
                <input
                  id={`additional-user-${index}-idir-input`}
                  data-testid={`additional-user-${index}-idir`}
                  value={additionalUser?.idirUsername ?? ''}
                  readOnly
                  disabled
                />
              </div>

              <button
                type="button"
                className="secondary remove-user-button"
                onClick={() => removeAdditionalUser(index)}
                aria-label={`Remove additional user ${index + 1}`}
              >
                Remove
              </button>
            </div>
          ))}

          <button
            type="button"
            className="secondary add-user-button"
            onClick={addAdditionalUser}
            disabled={formData.additionalUsers.length >= MAX_ADDITIONAL_USERS}
          >
            Add user
          </button>
        </fieldset>

        {/* Below fields hidden instead of disabled if not in schema */}

        {schemaFields.includes('materialToSend') && (
          <div className="input-wrapper first-col">
            <label htmlFor="materialToSend">SSO team notes</label>
            <textarea
              rows={6}
              id="materialToSend"
              name="materialToSend"
              onChange={handleFormInputChange}
              value={formData.materialToSend}
              placeholder="SSO team notes"
            />
          </div>
        )}
      </SForm>

      {updatedMessage && <p>{updatedMessage}</p>}

      <ButtonContainer className="button-container">
        <button className="secondary" onClick={onCancel} disabled={submittingForm}>
          Cancel
        </button>
        <button onClick={handleSubmit} disabled={submittingForm} className="primary">
          {submittingForm ? <SpinnerGrid color="#fff" height={15} width={15} wrapperClass="d-block" /> : 'Submit'}
        </button>
      </ButtonContainer>
    </>
  );
}
