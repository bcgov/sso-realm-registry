import React, { useState, useRef, ChangeEvent, useContext } from 'react';
import Head from 'next/head';
import { Grid as SpinnerGrid } from 'react-loader-spinner';
import styled from 'styled-components';
import Button from '@button-inc/bcgov-theme/Button';
import { submitRealmRequest } from 'services/realm';
import { CustomRealmFormData } from 'types/realm-profile';
import { withBottomAlert, BottomAlert } from 'layout/BottomAlert';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/router';
import { ModalContext } from 'context/modal';

const SForm = styled.form`
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 2em;
    row-gap: 1em;
    padding: 2em;

    .error-message {
        color: red;
        font-size: 0.8em;
        padding: 0;
        margin: 0;
    }

    .first-col {
        grid-column: 1;
    }

    .second-col {
        grid-column: 2;
    }

    .span-cols {
        grid-column: 1 / 3;
    }

    label, legend {
        &.required:after {
            content: ' *';
        }
    }
    fieldset {
        border: 0;
        legend {
            font-size: 1em;
            margin-bottom: 0;
        }
    }

    .input-wrapper {
        display: flex;
        flex-direction: column;
    }

    .checkbox-wrapper, .radio-wrapper {
        input {
            margin-right: 0.5em;
        }
    }

    .checkbox-wrapper.with-textarea {
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        justify-content: space-between;

        input {
            margin-top: 0.4em;
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
        grid-template-columns: 1fr 1fr;
        column-gap: 2em;
        row-gap: 1em;
    }
`

const ButtonContainer = styled.div`
    padding: 0 2em;
    width: 100%;
    display: flex;
    justify-content: space-between;
    button {
        width: 8em;
    }
`

const defaultData: CustomRealmFormData = {
    status: 'pending',
    realmName: '',
    realmPurpose: '',
    primaryUsers: {
        livingInBC: false,
        businessInBC: false,
        govEmployees: false,
        other: false,
        otherDetails: '',
    },
    environments: {
        dev: false,
        test: false,
        prod: false,
    },
    loginIdp: '',
    productOwnerEmail: '',
    productOwnerIdir: '',
    technicalContactEmail: '',
    technicalContactIdir: '',
    secondaryTechnicalContactIdir: '',
    secondaryTechnicalContactEmail: '',
}

const flatFields = [
    'loginIdp',
    'productOwnerEmail',
    'productOwnerIdir',
    'technicalContactEmail',
    'technicalContactIdir',
    'secondaryTechnicalContactIdir',
    'secondaryTechnicalContactEmail',
    'realmName',
    'realmPurpose',
]

const validateForm = (data: CustomRealmFormData) => {
    const errors: { [key in keyof CustomRealmFormData]?: boolean } = {}
    // All flatFields are required
    flatFields.forEach(fieldName => {
        if (!data[fieldName]) {
            errors[fieldName] = true;
        }
    })
    errors['environments'] = Object.values(data.environments).every(val => !val)
    errors['primaryUsers'] = Object.values(data.primaryUsers).every(val => !val)
    return errors;
}

interface Props {
    alert: BottomAlert;
}

function RealmForm({ alert }: Props) {
    const formRef = useRef<null | HTMLFormElement>(null);
    const [formData, setFormData] = useState<CustomRealmFormData>(defaultData);
    const [formErrors, setFormErrors] = useState<{ [key in keyof CustomRealmFormData]?: boolean }>({})
    const [submittingForm, setSubmittingForm] = useState(false);
    const { setModalConfig } = useContext(ModalContext)
    const router = useRouter()

    // Redirect if not authenticated/loading
    const { status } = useSession()
    if (!['loading', 'authenticated'].includes(status)) {
        signIn('keycloak', {
            callbackUrl: '/custom-realm-form'
        })
        return null;
    }

    const requiredMessage = 'Fill in the required fields.'

    const handleSubmit = async () => {
        const errors = validateForm(formData)
        const hasError = Object.values(errors).some(val => val)
        if (hasError) {
            return setFormErrors(errors);
        }
        setSubmittingForm(true);
        const [response, err] = await submitRealmRequest(formData)
        if (err) {
            alert.show({
                variant: 'danger',
                fadeOut: 10000,
                closable: true,
                content: 'Network request failure. Please try again.',
            })
        } else {
            router.push('/').then(() => {
                setModalConfig({
                    title: 'Custom Realm request submitted',
                    body: `We have received your request for a Custom Realm (ID ${response.id}). Please be assured that someone from our team will look into your request and will reach out soon.`,
                    show: true,
                })
            })            
        }
        setSubmittingForm(false);
    }

    // Change handlers
    const handleFormInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        setFormErrors({ ...formErrors, [e.target.name]: false })
        setFormData({ ...formData, [e.target.name]: e.target.value })
    }
    const handleFormCheckboxGroupChange = (
        e: ChangeEvent<HTMLInputElement>,
        groupName: keyof CustomRealmFormData
    ) => {
        setFormErrors({ ...formErrors, [groupName]: false })
        const newData = { ...formData, [groupName]: { ...formData[groupName], [e.target.name]: e.target.checked } }
        // Clear the details textarea if unchecking "other"
        if (e.target.name === 'other' && e.target.checked === false) {
            newData[groupName]['otherDetails'] = ""
        }
        setFormData(newData)
    }
    const handleOtherDetailsChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        setFormData({ ...formData, primaryUsers: { ...formData.primaryUsers, otherDetails: e.target.value } })
    }

    return (
        <>
            <Head>
                <title>Custom Realm</title>
            </Head>
            <SForm ref={formRef}>
                <h1>Request a Custom Realm</h1>

                <div className="input-wrapper first-col">
                    <label htmlFor="realm-name-input" className='required'>1. Custom Realm name</label>
                    <input
                        required
                        id='realm-name-input'
                        name='realmName'
                        onChange={handleFormInputChange}
                        value={formData.realmName}
                    />
                    {formErrors.realmName && <p className="error-message">{requiredMessage}</p>}
                </div>

                <div className="input-wrapper second-col">
                    <label htmlFor="realm-purpose-input" className='required'>2. Purpose of Realm</label>
                    <input
                        required
                        id='realm-purpose-input'
                        name='realmPurpose'
                        onChange={handleFormInputChange}
                        value={formData.realmPurpose}
                    />
                    {formErrors.realmPurpose && <p className="error-message">{requiredMessage}</p>}
                </div>

                <fieldset className="span-cols">
                    <legend className='required'>3. Who are the primary end users of your project/application? (select all that apply)</legend>
                    {formErrors.primaryUsers && <p className="error-message">You must select one or more.</p>}
                    <div className="grid">
                        <div className="checkbox-wrapper">
                            <input
                                type="checkbox"
                                id='living-in-bc-checkbox'
                                name='livingInBC'
                                onChange={e => handleFormCheckboxGroupChange(e, 'primaryUsers')}
                                checked={formData.primaryUsers.livingInBC}
                            />
                            <label htmlFor="living-in-bc-checkbox">People living in BC</label>
                        </div>

                        <div className="checkbox-wrapper">
                            <input
                                type="checkbox"
                                id='people-doing-business-checkbox'
                                name='businessInBC'
                                onChange={e => handleFormCheckboxGroupChange(e, 'primaryUsers')}
                                checked={formData.primaryUsers.businessInBC}
                            />
                            <label htmlFor="people-doing-business-checkbox">People doing business/travel in BC</label>
                        </div>

                        <div className="checkbox-wrapper">
                            <input
                                type="checkbox"
                                id='bc-gov-employees-checkbox'
                                name='govEmployees'
                                onChange={e => handleFormCheckboxGroupChange(e, 'primaryUsers')}
                                checked={formData.primaryUsers.govEmployees}
                            />
                            <label htmlFor="bc-gov-employees-checkbox">BC Gov employees</label>
                        </div>

                        <div className="checkbox-wrapper with-textarea">
                            <input
                                type="checkbox"
                                id='other-users-checkbox'
                                name="other"
                                onChange={e => handleFormCheckboxGroupChange(e, 'primaryUsers')}
                                checked={formData.primaryUsers.other}
                            />
                            <label htmlFor="other-users-checkbox">Other</label>
                            <div className="textarea-container">
                                <textarea
                                    rows={2}
                                    placeholder='Enter details'
                                    name="otherDetails"
                                    onChange={handleOtherDetailsChange}
                                    disabled={!formData.primaryUsers.other}
                                    value={formData.primaryUsers.otherDetails}
                                    maxLength={100}
                                />
                                <p className="help-text">100 Characters max.</p>
                            </div>
                        </div>

                    </div>
                </fieldset>

                <fieldset className="span-cols">
                    <legend className='required'>4. Select all applicable environments</legend>
                    {formErrors.environments && <p className="error-message">You must select one or more.</p>}
                    <div className="grid">
                        <div className="checkbox-wrapper">
                            <input
                                type="checkbox"
                                id='dev-env-checkbox'
                                name="dev"
                                onChange={e => handleFormCheckboxGroupChange(e, 'environments')}
                                checked={formData.environments.dev}
                            />
                            <label htmlFor="dev-env-checkbox">Development</label>
                        </div>

                        <div className="checkbox-wrapper">
                            <input
                                type="checkbox"
                                id='test-env-checkbox'
                                name="test"
                                onChange={e => handleFormCheckboxGroupChange(e, 'environments')}
                                checked={formData.environments.test}
                            />
                            <label htmlFor="test-env-checkbox">Test</label>
                        </div>

                        <div className="checkbox-wrapper">
                            <input
                                type="checkbox"
                                id='prod-env-checkbox'
                                name="prod"
                                onChange={e => handleFormCheckboxGroupChange(e, 'environments')}
                                checked={formData.environments.prod}
                            />
                            <label htmlFor="prod-env-checkbox">Prod</label>
                        </div>
                    </div>
                </fieldset>

                <fieldset className="span-cols">
                    <legend className='required'>5. How will your Realm Admin(s) be logging in?</legend>
                    {formErrors.loginIdp && <p className="error-message">You must select one.</p>}
                    <div className="grid">
                        <div className="radio-wrapper">
                            <input
                                type="radio"
                                id='idir-radio'
                                name="loginIdp"
                                value="idir"
                                onChange={handleFormInputChange}
                            />
                            <label htmlFor="idir-radio">IDIR</label>
                        </div>

                        <div className="radio-wrapper">
                            <input
                                type="radio"
                                id='azure-idir-radio'
                                name="loginIdp"
                                value="azureIdir"
                                onChange={handleFormInputChange}
                            />
                            <label htmlFor="azure-idir-radio">Azure IDIR</label>
                        </div>
                    </div>
                </fieldset>

                <div className="input-wrapper first-col">
                    <label htmlFor="product-owner-email-input" className='required'>6. Product owner's email</label>
                    <input
                        required
                        id='product-owner-email-input'
                        name="productOwnerEmail"
                        value={formData.productOwnerEmail}
                        onChange={handleFormInputChange}
                    />
                    {formErrors.productOwnerEmail && <p className="error-message">{requiredMessage}</p>}
                </div>

                <div className="input-wrapper second-col">
                    <label htmlFor="product-owner-idir-input" className='required'>7. Product owner's IDIR</label>
                    <input
                        required
                        id='product-owner-idir-input'
                        name="productOwnerIdir"
                        value={formData.productOwnerIdir}
                        onChange={handleFormInputChange}
                    />
                    {formErrors.productOwnerIdir && <p className="error-message">{requiredMessage}</p>}
                </div>

                <div className="input-wrapper first-col">
                    <label htmlFor="technical-contact-email-input" className='required'>8. Technical contact's email</label>
                    <input
                        required
                        id='technical-contact-email-input'
                        name="technicalContactEmail"
                        value={formData.technicalContactEmail}
                        onChange={handleFormInputChange}
                    />
                    {formErrors.technicalContactEmail && <p className="error-message">{requiredMessage}</p>}
                </div>

                <div className="input-wrapper second-col">
                    <label htmlFor="technical-contact-idir-input" className='required'>9. Technical contact's IDIR</label>
                    <input
                        required
                        id='technical-contact-idir-input'
                        name="technicalContactIdir"
                        value={formData.technicalContactIdir}
                        onChange={handleFormInputChange}
                    />
                    {formErrors.technicalContactIdir && <p className="error-message">{requiredMessage}</p>}
                </div>

                <div className="input-wrapper first-col">
                    <label htmlFor="secondary-contact-email-input" className='required'>10. Secondary technical contact's email</label>
                    <input
                        required
                        id='secondary-contact-email-input'
                        name="secondaryTechnicalContactEmail"
                        value={formData.secondaryTechnicalContactEmail}
                        onChange={handleFormInputChange}
                    />
                    {formErrors.secondaryTechnicalContactEmail && <p className="error-message">{requiredMessage}</p>}
                </div>

                <div className="input-wrapper second-col">
                    <label htmlFor="secondary-contact-idir-input" className='required'>11. Secondary technical contact's IDIR</label>
                    <input
                        required
                        id='secondary-contact-idir-input'
                        name="secondaryTechnicalContactIdir"
                        value={formData.secondaryTechnicalContactIdir}
                        onChange={handleFormInputChange}
                    />
                    {formErrors.secondaryTechnicalContactIdir && <p className="error-message">{requiredMessage}</p>}
                </div>

            </SForm>
            <ButtonContainer className="button-container">
                <Button variant="secondary">Cancel</Button>
                <Button onClick={handleSubmit} disabled={submittingForm}>{
                    submittingForm ?
                        <SpinnerGrid color="#fff" height={15} width={15} wrapperClass="d-block" />
                        :
                        'Submit'
                }</Button>
            </ButtonContainer>
        </>
    );
}

export default withBottomAlert(RealmForm);
