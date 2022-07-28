import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Grid as SpinnerGrid } from 'react-loader-spinner';
import styled from 'styled-components';
import StyledTable from 'html-components/Table';
import ResponsiveContainer, { MediaRule } from 'components/ResponsiveContainer';
import CenteredModal from 'components/CenteredModal';
import { reduce, forEach, uniq } from 'lodash';
import Link from '@button-inc/bcgov-theme/Link';
import Button from '@button-inc/bcgov-theme/Button';
import Input from '@button-inc/bcgov-theme/Input';
import Grid from '@button-inc/bcgov-theme/Grid';
import Modal from '@button-inc/bcgov-theme/Modal';
import Tabs from 'components/Tabs';
import RadioGroup from 'components/RadioGroup';
import DeleteUserConfirmationModal from 'page-partials/my-dashboard/DeleteUserConfirmationModal';
import { findIdirUser, deleteIdirUser } from 'services/user';
import { getRealmProfiles } from 'services/realm';
import { RealmProfile } from 'types/realm-profile';

const Container = styled.div`
  padding: 20px 20px;
  color: #777777;

  input {
    border-color: #777777 !important;
    width: 100%;
  }
`;

const TableContent = ({
  data,
  env,
  openDelete,
  deletedEnvs,
  deletingEnvs,
  handleDeleteClick,
  handleDeleteChange,
}: any) => {
  const info = data[env];

  if (info.result === 'notfound') {
    return <div>The user was not found. Please search again and enter an exact match.</div>;
  } else if (info.result === 'idironly') {
    if (deletedEnvs.includes(env)) {
      return <div>User was successfully deleted, please verify and ask user to log into your realm.</div>;
    } else {
      return (
        <>
          <Button type="button" size="small" onClick={handleDeleteClick}>
            {deletingEnvs.includes(env) ? (
              <SpinnerGrid color="#fff" height={15} width={15} wrapperClass="d-block" visible={true} />
            ) : (
              <span>Delete</span>
            )}
          </Button>
          <DeleteUserConfirmationModal open={openDelete} onChange={(yes) => handleDeleteChange(yes, env)} />
        </>
      );
    }
  } else if (info.result === 'others') {
    return (
      <div>
        The user was found in a realm that you do not own. Please fill out this{' '}
        <Link
          href="https://github.com/BCDevOps/devops-requests/issues/new?assignees=jlangy%2C+junminahn%2C+arcshiftsolutions%2C+zsamji%2CConradBoydElliottGustafson&labels=sso-delete-user%2C+sso&template=keycloak_user_removal_request.md&title="
          title="Rocket Chat"
          external
        >
          Github issue
        </Link>
        ,{' '}
        <Link href="https://chat.developer.gov.bc.ca/channel/sso" title="Rocket Chat" external>
          message
        </Link>{' '}
        us on rocketchat or{' '}
        <Link href="mailto:bcgov.sso@gov.bc.ca" title="Pathfinder SSO">
          email
        </Link>{' '}
        the SSO team to delete the user.
      </div>
    );
  } else if (info.result === 'found' && info.affected) {
    return (
      <>
        <p>
          Navigate to your custom realm(s) below to delete this user, then come back here, search for the user again and
          delete them.
        </p>
        <ul>
          {info.affected.map((realm: string) => (
            <li key={realm}>
              <Link
                href={`https://${env === 'prod' ? '' : env + '.'}oidc.gov.bc.ca/auth/admin/${realm}/console`}
                external
              >
                {realm}
              </Link>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return null;
};

interface Props {}

function DuplicateIDIR({}: Props) {
  const [loading, setLoading] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [searchKey, setSearchKey] = useState('');
  const [deletedEnvs, setDeletedEnvs] = useState<string[]>([]);
  const [deletingEnvs, setDeletingEvns] = useState<string[]>([]);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchKey(event.target.value.toLowerCase());
  };

  const handleDeleteClick = async () => {
    setOpenDelete(true);
  };

  const handleDeleteChange = async (toDelete: boolean, env: string) => {
    if (loading) return;
    if (toDelete) {
      setDeletingEvns(deletingEnvs.concat(env));
      await deleteIdirUser(searchKey, env);
      setDeletedEnvs(deletedEnvs.concat(env));
      setDeletingEvns(deletingEnvs.filter((v) => v !== env));
    }

    setOpenDelete(false);
  };

  const handleSearchSubmit = async () => {
    if (loading) return;
    setLoading(true);
    setResult(null);
    setDeletedEnvs([]);
    setDeletingEvns([]);
    const [result] = await findIdirUser(searchKey);
    setResult(result);
    setLoading(false);
  };

  const handleKeyUp = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSearchSubmit();
    }
  };

  return (
    <Container>
      <h3>Are your IDIR users having trouble authenticating?</h3>
      <p>If they are, then your user might be duplicated in your realm and the duplicate needs to be deleted.</p>
      <p>
        To start, please <strong>search for the user</strong> with their IDIR or email address.
      </p>
      <Grid cols={10} gutter={[5, 2]} style={{ overflowX: 'hidden', width: '600px', maxWidth: '100%' }}>
        <Grid.Row collapse="800">
          <Grid.Col span={7}>
            <Input
              type="text"
              size="medium"
              minLength="3"
              maxLength="50"
              placeholder="Enter IDIR ID or Email"
              value={searchKey}
              disabled={loading}
              onKeyUp={handleKeyUp}
              onChange={handleSearchChange}
            />
          </Grid.Col>
          <Grid.Col span={3}>
            <Button variant="primary" size="medium" onClick={handleSearchSubmit} disabled={searchKey.length < 3}>
              {loading ? (
                <SpinnerGrid color="#fff" height={15} width={15} wrapperClass="d-block" visible={loading} />
              ) : (
                <span>Search</span>
              )}
            </Button>
          </Grid.Col>
        </Grid.Row>
      </Grid>
      {result && (
        <StyledTable>
          <thead>
            <tr>
              <th>
                <h4>Dev</h4>
              </th>
              <th>
                <h4>Test</h4>
              </th>
              <th>
                <h4>Prod</h4>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ width: '30%', verticalAlign: 'top' }}>
                <TableContent
                  data={result}
                  env="dev"
                  deletedEnvs={deletedEnvs}
                  deletingEnvs={deletingEnvs}
                  openDelete={openDelete}
                  handleDeleteClick={handleDeleteClick}
                  handleDeleteChange={handleDeleteChange}
                />
              </td>
              <td style={{ width: '30%', verticalAlign: 'top' }}>
                <TableContent
                  data={result}
                  env="test"
                  deletedEnvs={deletedEnvs}
                  deletingEnvs={deletingEnvs}
                  openDelete={openDelete}
                  handleDeleteClick={handleDeleteClick}
                  handleDeleteChange={handleDeleteChange}
                />
              </td>
              <td style={{ width: '30%', verticalAlign: 'top' }}>
                <TableContent
                  data={result}
                  env="prod"
                  deletedEnvs={deletedEnvs}
                  deletingEnvs={deletingEnvs}
                  openDelete={openDelete}
                  handleDeleteClick={handleDeleteClick}
                  handleDeleteChange={handleDeleteChange}
                />
              </td>
            </tr>
          </tbody>
        </StyledTable>
      )}
    </Container>
  );
}

export default DuplicateIDIR;
