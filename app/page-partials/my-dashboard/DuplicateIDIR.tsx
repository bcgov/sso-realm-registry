import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Loader from 'react-loader-spinner';
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
  realm,
  openDelete,
  deletedEnvs,
  deletingEnvs,
  handleDeleteClick,
  handleDeleteChange,
}: any) => {
  const info = data[env];

  if (info.result === 'notfound') {
    if (realm === 'idir') {
      return <div>--</div>;
    }
  } else if (info.result === 'idironly') {
    if (realm === 'idir') {
      if (!deletedEnvs.includes(env)) {
        return (
          <>
            <Button type="button" size="small" onClick={handleDeleteClick}>
              {deletingEnvs.includes(env) ? (
                <Loader type="Grid" color="#fff" height={15} width={15} visible={true} />
              ) : (
                <span>Delete</span>
              )}
            </Button>
            <DeleteUserConfirmationModal open={openDelete} onChange={(yes) => handleDeleteChange(yes, env)} />
          </>
        );
      }
    }

    return <div>--</div>;
  } else if (info.result === 'others') {
    if (realm === 'idir') {
      return (
        <Button type="button" size="small" disabled={true}>
          <span>Delete</span>
        </Button>
      );
    } else if (realm === 'others') {
      return (
        <div>
          The user was found in a realm that you do not own.Need help? Message us on the{' '}
          <Link href="https://chat.developer.gov.bc.ca/channel/sso" title="Rocket Chat" external>
            Message
          </Link>{' '}
          or{' '}
          <Link href="mailto:bcgov.sso@gov.bc.ca" title="Pathfinder SSO">
            email
          </Link>{' '}
          the SSO team to delete the user.
        </div>
      );
    }

    return <div>--</div>;
  } else if (info.result === 'found') {
    if (realm === 'idir') {
      return (
        <Button type="button" size="small" disabled={true}>
          <span>Delete</span>
        </Button>
      );
    } else if (realm !== 'others') {
      return (
        <div>
          Navigate to your{' '}
          <Link href={`https://${env === 'prod' ? '' : env + '.'}oidc.gov.bc.ca/auth/admin/${realm}/console`} external>
            Realm
          </Link>{' '}
          to delete the user, then search for the user again in this app.
        </div>
      );
    }
  }

  return <div>--</div>;
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
    setSearchKey(event.target.value);
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

  let realms = ['idir'];
  let foundOthers = false;
  forEach(result, (val, key) => {
    if (val.result === 'found') {
      realms = realms.concat(val.affected);
    } else if (val.result === 'others') {
      foundOthers = true;
    }
  });

  realms = uniq(realms);
  if (foundOthers) realms.push('others');

  return (
    <Container>
      <h3>Are your IDIR users having trouble authenticating?</h3>
      <p>If they are, your user might be duplicated in your realm, and the duplicate entry needs to be deleted.</p>
      <p>
        To start, <strong>search for the user</strong> that is having trouble authenticating.
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
              onChange={handleSearchChange}
            />
          </Grid.Col>
          <Grid.Col span={3}>
            <Button variant="primary" size="medium" onClick={handleSearchSubmit} disabled={searchKey.length < 3}>
              {loading ? (
                <Loader type="Grid" color="#fff" height={15} width={15} visible={loading} />
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
                <h4>Realm</h4>
              </th>
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
            {realms.map((realm) => {
              return (
                <tr key={realm}>
                  <td style={{ width: '10%' }}>{realm}</td>
                  <td style={{ width: '30%' }}>
                    <TableContent
                      data={result}
                      env="dev"
                      realm={realm}
                      deletedEnvs={deletedEnvs}
                      deletingEnvs={deletingEnvs}
                      openDelete={openDelete}
                      handleDeleteClick={handleDeleteClick}
                      handleDeleteChange={handleDeleteChange}
                    />
                  </td>
                  <td style={{ width: '30%' }}>
                    <TableContent
                      data={result}
                      env="test"
                      realm={realm}
                      deletedEnvs={deletedEnvs}
                      deletingEnvs={deletingEnvs}
                      openDelete={openDelete}
                      handleDeleteClick={handleDeleteClick}
                      handleDeleteChange={handleDeleteChange}
                    />
                  </td>
                  <td style={{ width: '30%' }}>
                    <TableContent
                      data={result}
                      env="prod"
                      realm={realm}
                      deletedEnvs={deletedEnvs}
                      deletingEnvs={deletingEnvs}
                      openDelete={openDelete}
                      handleDeleteClick={handleDeleteClick}
                      handleDeleteChange={handleDeleteChange}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </StyledTable>
      )}
    </Container>
  );
}

export default DuplicateIDIR;
