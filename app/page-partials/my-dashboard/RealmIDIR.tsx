import React, { useState } from 'react';
import styled from 'styled-components';
import { Grid as SpinnerGrid } from 'react-loader-spinner';
import Link from '@button-inc/bcgov-theme/Link';
import Input from '@button-inc/bcgov-theme/Input';
import Button from '@button-inc/bcgov-theme/Button';
import { RealmProfile } from 'types/realm-profile';
import NumberedContents from 'components/NumberedContents';
import { findIdirUser, deleteIdirUser } from 'services/user';
import DeleteUserConfirmationModal from 'page-partials/my-dashboard/DeleteUserConfirmationModal';
import RealmURIs from 'page-partials/my-dashboard/RealmURIs';

const Container = styled.div`
  color: #777777;
`;

const Italic = styled.p`
  font-style: italic;

  a {
    color: #38598a;
    font-weight: 600;
  }
`;

const BottomSection = styled.div`
  padding-top: 25px;
`;

const NeedHelp = () => {
  return (
    <BottomSection>
      <Italic>
        Need help? Message us on the{' '}
        <a href="https://chat.developer.gov.bc.ca/channel/sso" target="_blank" title="Rocket Chat">
          #SSO channel
        </a>{' '}
        or{' '}
        <a href="mailto:bcgov.sso@gov.bc.ca" title="Pathfinder SSO">
          email us
        </a>
      </Italic>
    </BottomSection>
  );
};

interface Props {
  realm: RealmProfile;
}

function RealmIDIR({ realm }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ result: string; affected?: string[]; username?: string }>({ result: '' });
  const [searchKey, setSearchKey] = useState('');
  const [openDelete, setOpenDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchKey(event.target.value);
  };

  const handleSearchSubmit = async () => {
    if (loading) return;
    setLoading(true);
    setOpenDelete(false);
    setDeleted(false);
    setDeleting(false);
    setResult({ result: '' });
    const [result] = await findIdirUser(searchKey);
    setResult(result);
    setLoading(false);
  };

  const handleDeleteClick = async () => {
    setOpenDelete(true);
  };

  const handleDeleteChange = async (toDelete: boolean) => {
    if (loading) return;
    if (toDelete) {
      setDeleting(true);
      const [result] = await deleteIdirUser(searchKey, 'dev');
      setDeleted(result?.success === true);
      setDeleting(false);
    }

    setOpenDelete(false);
  };

  let bottomSection = null;
  console.log(result);
  if (result.result === 'notfound') {
    bottomSection = (
      <>
        <NumberedContents
          title={`Your user was not found. Please search again and enter an exact match.`}
          variant="black"
          symbol={'!'}
          showLine={false}
        />
        <NeedHelp />
      </>
    );
  } else if (result.result === 'idironly') {
    if (deleted) {
      bottomSection = (
        <>
          <NumberedContents
            title={`Your following user has successfully been deleted`}
            variant="black"
            symbol={'2'}
            showLine={true}
          >
            <Italic>{result.username}</Italic>
          </NumberedContents>
          <NumberedContents title={`Re-login to your application`} variant="black" symbol={'3'} showLine={false}>
            <Italic>{result.username}</Italic>
            <p>Please ask your user to re-login to your realm. This will automatically re-create the user.</p>
          </NumberedContents>
          <NeedHelp />
        </>
      );
    } else {
      bottomSection = (
        <>
          <NumberedContents
            title={`Would you like to delete the following user?`}
            variant="black"
            symbol={'2'}
            showLine={false}
          >
            <Italic>{result.username}</Italic>
            <Button type="button" size="small" onClick={handleDeleteClick}>
              {deleting ? (
                <SpinnerGrid color="#fff" height={15} width={15} wrapperClass="d-block" visible={deleting} />
              ) : (
                <span>Delete</span>
              )}
            </Button>
          </NumberedContents>
          <DeleteUserConfirmationModal open={openDelete} onChange={handleDeleteChange} />
          <NeedHelp />
        </>
      );
    }
  } else if (result.result === 'others') {
    bottomSection = (
      <>
        <NumberedContents
          title={`Your user was found in multiple realms. Please contact the Pathfinder SSO team to delete the user.`}
          variant="black"
          symbol={'!'}
          showLine={false}
        />
        <NeedHelp />
      </>
    );
  } else if (result.result === 'found' && result.affected) {
    bottomSection = (
      <>
        <NumberedContents title={`The user was found in your realm(s)`} variant="black" symbol={'2'} showLine={false}>
          <p>
            The user was found in the following realm. Please go to this realm and delete the user from there, and then
            ask the user to re-login.
          </p>
          <ul>
            {result.affected.map((realmName) => (
              <li>
                <Link
                  href={`https://dev.loginproxy.gov.bc.ca/auth/admin/${realmName}/console`}
                  external
                >{`Realm Link: ${realmName}`}</Link>
              </li>
            ))}
          </ul>
        </NumberedContents>
        <NeedHelp />
      </>
    );
  }

  return (
    <Container>
      <h3>Are your IDIR users having trouble authenticating?</h3>
      <p>
        If they are, try deleting them and then asking them to re-login to your realm. This will automatically re-create
        the user.
      </p>
      <NumberedContents
        title="Find the user you would like to delete"
        variant="black"
        symbol="1"
        showLine={!!bottomSection}
      >
        <Input
          type="text"
          size="medium"
          maxLength="50"
          placeholder="Enter IDIR ID or Email"
          style={{ maxWidth: '400px' }}
          value={searchKey}
          disabled={loading}
          onChange={handleSearchChange}
        />
        <Button type="button" size="small" onClick={handleSearchSubmit}>
          {loading ? (
            <SpinnerGrid color="#fff" height={15} width={15} wrapperClass="d-block" visible={loading} />
          ) : (
            <span>Search</span>
          )}
        </Button>
      </NumberedContents>
      {bottomSection}
    </Container>
  );
}

export default RealmIDIR;
