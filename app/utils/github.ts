import getConfig from 'next/config';
import { Octokit } from 'octokit';
import { generateCustomRealmTf } from './terraform';
import { Base64 } from 'js-base64';
import { GetResponseTypeFromEndpointMethod } from '@octokit/types';

const { serverRuntimeConfig = {} } = getConfig() || {};
const { tf_gh_org, tf_gh_repo, tf_module_gh_ref, gh_access_token } = serverRuntimeConfig;

const octokit = new Octokit({ auth: gh_access_token });

export type CreatePullRequestResponseType = GetResponseTypeFromEndpointMethod<typeof octokit.rest.pulls.create>;

const getMainBranch = async () => {
  const mainBranch = await octokit.rest.repos.getBranch({
    owner: tf_gh_org,
    repo: tf_gh_repo,
    branch: 'main',
  });
  if (!mainBranch) {
    throw new Error('Main branch not found');
  }
  return mainBranch;
};

export async function createCustomRealmPullRequest(
  realmName: string,
  envs: string[],
): Promise<CreatePullRequestResponseType> {
  const mainBranch = await getMainBranch();

  await octokit.rest.git.createRef({
    owner: tf_gh_org,
    repo: tf_gh_repo,
    ref: `refs/heads/custom/${realmName}`,
    sha: mainBranch.data.commit.sha,
  });
  const tfContent = generateCustomRealmTf(realmName, tf_module_gh_ref);

  const tfBase64Encoded = Base64.encode(tfContent);

  // create a blob of the tf content
  const ghBlob = await octokit.rest.git.createBlob({
    owner: tf_gh_org,
    repo: tf_gh_repo,
    content: tfBase64Encoded,
    encoding: 'base64',
  });

  // create tf files by env
  const ghTree = await octokit.rest.git.createTree({
    owner: tf_gh_org,
    repo: tf_gh_repo,
    base_tree: mainBranch.data.commit.sha,
    tree: envs.map((env) => {
      return {
        path: `terraform-v2-custom/keycloak-${env}/custom-realms/${realmName}.tf`,
        mode: '100644',
        type: 'blob',
        sha: ghBlob.data.sha,
      };
    }),
  });

  // make a commit to new branch
  const ghCommit = await octokit.rest.git.createCommit({
    owner: tf_gh_org,
    repo: tf_gh_repo,
    tree: ghTree.data.sha,
    message: `feat: create custom realm ${realmName}`,
    committer: {
      name: 'Pathfinder SSO Team',
      email: '88675972+Pathfinder-SSO-Team@users.noreply.github.com',
    },
    author: {
      name: 'Pathfinder SSO Team',
      email: '88675972+Pathfinder-SSO-Team@users.noreply.github.com',
    },
    parents: [mainBranch.data.commit.sha],
  });

  await octokit.rest.git.updateRef({
    owner: tf_gh_org,
    repo: tf_gh_repo,
    ref: `heads/custom/${realmName}`,
    sha: ghCommit.data.sha,
  });

  // return the created pull request
  const pr = await octokit.rest.pulls.create({
    owner: tf_gh_org,
    repo: tf_gh_repo,
    title: `feat: create custom realm ${realmName}`,
    body: `Created through request created at realm registry for a custom realm ${realmName}`,
    head: `custom/${realmName}`,
    base: 'main',
  });
  return pr;
}

export const mergePullRequest = async (prNumber: number) => {
  return await octokit.rest.pulls.merge({
    owner: tf_gh_org,
    repo: tf_gh_repo,
    pull_number: prNumber,
  });
};

export const deleteBranch = async (realmName: string) => {
  return await octokit.rest.git.deleteRef({
    owner: tf_gh_org,
    repo: tf_gh_repo,
    ref: `heads/custom/${realmName}`,
  });
};
