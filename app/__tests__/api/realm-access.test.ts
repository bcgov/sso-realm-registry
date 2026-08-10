import prisma from 'utils/prisma';
import { syncUserAccess } from 'controllers/keycloak';
import {
  applyMembershipChanges,
  countUnresolvedMembers,
  needsSync,
  reconcileRealmAccess,
  resolveMembership,
  revokeAllRealmAccess,
} from 'controllers/user-access';
import { fetchIdirUserByAzureId } from 'controllers/msal';
import { MemberRoleEnum } from 'utils/constants';
import { buildMember, buildUser, roster } from '../fixtures';

jest.mock('../../controllers/keycloak', () => {
  return {
    syncUserAccess: jest.fn(() => Promise.resolve()),
  };
});

jest.mock('../../controllers/msal', () => {
  return {
    fetchIdirUserByAzureId: jest.fn(),
  };
});

const appliedRealm = { ...roster, realm: 'my-realm', approved: true, status: 'applied', archived: false };

/** Runs an interactive transaction against the prisma mock. */
const mockTransaction = () => (prisma.$transaction as unknown as jest.Mock).mockImplementation((cb: any) => cb(prisma));

const mockPending = (members: any[]) =>
  (prisma.userRoster.findMany as jest.Mock).mockImplementation((args: any) => {
    // The second call in reconcile asks for the live rows, to spot re-adds.
    if (args?.select?.userId) {
      return Promise.resolve(members.filter((m) => m.removedAt === null).map((m) => ({ userId: m.userId })));
    }
    return Promise.resolve(members);
  });

describe('reconcileRealmAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.userRoster.update as jest.Mock).mockImplementation(() => Promise.resolve({}));
  });

  it('does nothing for a realm that is not provisioned yet', async () => {
    const notApplied = { ...appliedRealm, status: 'pending', approved: null };
    const result = await reconcileRealmAccess(notApplied as any);

    expect(result.provisioned).toBe(false);
    expect(syncUserAccess).not.toHaveBeenCalled();
  });

  it('processes removals before adds', async () => {
    const leaving = buildMember(
      MemberRoleEnum.TECHNICAL_LEAD,
      { idirUsername: 'leaver', guid: 'guid-leaver' },
      { removedAt: new Date(), revokedAt: null, syncedAt: new Date() },
    );
    const joining = buildMember(
      MemberRoleEnum.TECHNICAL_LEAD,
      { idirUsername: 'joiner', guid: 'guid-joiner' },
      { syncedAt: null },
    );
    mockPending([leaving, joining]);

    await reconcileRealmAccess(appliedRealm as any);

    const actions = (syncUserAccess as jest.Mock).mock.calls.map(([, , guid, action]) => [guid, action]);
    expect(actions[0]).toEqual(['guid-leaver', 'remove']);
    expect(actions[actions.length - 1]).toEqual(['guid-joiner', 'add']);
  });

  it('removes group membership and the direct role in every environment', async () => {
    const leaving = buildMember(
      MemberRoleEnum.ADDITIONAL,
      { idirUsername: 'leaver', guid: 'guid-leaver' },
      { removedAt: new Date(), revokedAt: null },
    );
    mockPending([leaving]);

    const result = await reconcileRealmAccess(appliedRealm as any);

    expect(syncUserAccess).toHaveBeenCalledTimes(3);
    ['dev', 'test', 'prod'].forEach((env) =>
      expect(syncUserAccess).toHaveBeenCalledWith('my-realm', env, 'guid-leaver', 'remove'),
    );
    expect(result.removed).toHaveLength(1);
    expect((prisma.userRoster.update as jest.Mock).mock.calls[0][0].data.revokedAt).toBeInstanceOf(Date);
  });

  it('skips a tombstone whose user was re-added, and clears it without touching keycloak', async () => {
    const user = buildUser({ idirUsername: 'mover', guid: 'guid-mover' });
    const tombstone = buildMember(MemberRoleEnum.ADDITIONAL, {}, { removedAt: new Date(), revokedAt: null });
    const readded = buildMember(MemberRoleEnum.TECHNICAL_LEAD, {}, { syncedAt: null });
    // Same person, two rows on the same roster.
    tombstone.user = user;
    tombstone.userId = user.id;
    readded.user = user;
    readded.userId = user.id;

    mockPending([tombstone, readded]);

    await reconcileRealmAccess(appliedRealm as any);

    // Only the add ran; the revoke would have stripped the access just granted.
    const actions = (syncUserAccess as jest.Mock).mock.calls.map(([, , , action]) => action);
    expect(actions.every((action) => action === 'add')).toBe(true);

    // The tombstone is still settled, so it does not keep the realm looking unsynced.
    const revokeUpdate = (prisma.userRoster.update as jest.Mock).mock.calls.find(
      ([args]) => args.data.revokedAt !== undefined,
    );
    expect(revokeUpdate[0].where.id).toBe(tombstone.id);
  });

  it('only stamps synced_at once every environment succeeded', async () => {
    const joining = buildMember(
      MemberRoleEnum.ADDITIONAL,
      { idirUsername: 'asmith', guid: 'guid-a' },
      { syncedAt: null },
    );
    mockPending([joining]);

    (syncUserAccess as jest.Mock).mockImplementation((realm, env) => {
      if (env === 'prod') return Promise.reject(new Error('ECONNREFUSED'));
      return Promise.resolve();
    });

    const result = await reconcileRealmAccess(appliedRealm as any);

    expect(result.added).toEqual([]);
    expect(prisma.userRoster.update).not.toHaveBeenCalled();
    expect(result.failures).toEqual([{ idirUsername: 'asmith', env: 'prod', action: 'add', error: 'ECONNREFUSED' }]);
  });

  it('never syncs a member who could not be resolved in the directory', async () => {
    mockPending([]);
    await reconcileRealmAccess(appliedRealm as any);

    const where = (prisma.userRoster.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.user).toEqual({ guid: { not: null } });
  });

  it('reconciles only the requested members when given ids', async () => {
    mockPending([]);
    await reconcileRealmAccess(appliedRealm as any, { memberIds: [4, 5] });

    const where = (prisma.userRoster.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.id).toEqual({ in: [4, 5] });
  });
});

describe('applyMembershipChanges', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTransaction();
    (prisma.userRoster.update as jest.Mock).mockImplementation(() => Promise.resolve({}));
  });

  it('tombstones the outgoing member and inserts the new one', async () => {
    const outgoing = { id: 11, userId: 1, rosterId: 1, role: MemberRoleEnum.PRODUCT_OWNER, removedAt: null };
    (prisma.userRoster.findMany as jest.Mock).mockImplementation(() => Promise.resolve([outgoing]));
    (prisma.userRoster.create as jest.Mock).mockImplementation(() => Promise.resolve({ id: 12 }));

    const incoming = buildUser({ idirUsername: 'new-po', guid: 'guid-new' });
    const result = await applyMembershipChanges(1, [{ user: incoming, role: MemberRoleEnum.PRODUCT_OWNER }]);

    // Nothing is hard deleted: the tombstone is the record that access must be withdrawn.
    expect(prisma.userRoster.delete).not.toHaveBeenCalled();
    expect((prisma.userRoster.update as jest.Mock).mock.calls[0][0]).toEqual({
      where: { id: 11 },
      data: { removedAt: expect.any(Date) },
    });
    expect(result.removedIds).toEqual([11]);
    expect(result.addedIds).toEqual([12]);
    expect(result.changedIds).toEqual([11, 12]);
  });

  it('leaves an unchanged member alone', async () => {
    const user = buildUser({ idirUsername: 'steady', guid: 'guid-steady' });
    (prisma.userRoster.findMany as jest.Mock).mockImplementation(() =>
      Promise.resolve([{ id: 20, userId: user.id, rosterId: 1, role: MemberRoleEnum.PRODUCT_OWNER, removedAt: null }]),
    );

    const result = await applyMembershipChanges(1, [{ user, role: MemberRoleEnum.PRODUCT_OWNER }]);

    expect(prisma.userRoster.update).not.toHaveBeenCalled();
    expect(prisma.userRoster.create).not.toHaveBeenCalled();
    expect(result.changedIds).toEqual([]);
  });
});

describe('resolveMembership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('re-resolves identity from graph and ignores client supplied values', async () => {
    (fetchIdirUserByAzureId as jest.Mock).mockImplementation((azureId: string) =>
      Promise.resolve({
        guid: `real-guid-${azureId}`,
        idirUsername: `realuser-${azureId}`,
        email: 'real@gov.bc.ca',
        displayName: 'Real',
      }),
    );
    (prisma.user.findUnique as jest.Mock).mockImplementation(() => Promise.resolve(null));
    (prisma.user.findFirst as jest.Mock).mockImplementation(() => Promise.resolve(null));
    let createdId = 0;
    (prisma.user.create as jest.Mock).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: ++createdId, ...data }),
    );

    const desired = await resolveMembership({
      productOwner: { azureId: 'azure-1', guid: 'attacker-guid', idirUsername: 'attacker' } as any,
      technicalLead: { azureId: 'azure-2' },
    });

    // The guid stored is the one Graph returned, never the one the client sent.
    expect(desired[0].user.guid).toBe('real-guid-azure-1');
    expect(desired[0].user.idirUsername).toBe('realuser-azure-1');
    expect((prisma.user.create as jest.Mock).mock.calls[0][0].data.guid).toBe('real-guid-azure-1');
    expect(JSON.stringify((prisma.user.create as jest.Mock).mock.calls[0][0])).not.toContain('attacker');
  });

  it('rejects a selection with no IDIR guid', async () => {
    (fetchIdirUserByAzureId as jest.Mock).mockImplementation(() =>
      Promise.resolve({ guid: null, idirUsername: 'noguid', email: null, displayName: null }),
    );

    await expect(
      resolveMembership({ productOwner: { azureId: 'azure-1' }, technicalLead: { azureId: 'azure-2' } }),
    ).rejects.toThrow(/no IDIR guid/);
  });

  it('rejects the same person in two slots', async () => {
    const user = { id: 5, guid: 'guid-dup', idirUsername: 'dup' };
    (fetchIdirUserByAzureId as jest.Mock).mockImplementation(() =>
      Promise.resolve({ guid: 'guid-dup', idirUsername: 'dup', email: null, displayName: null }),
    );
    (prisma.user.findUnique as jest.Mock).mockImplementation(() => Promise.resolve(user));
    (prisma.user.update as jest.Mock).mockImplementation(() => Promise.resolve(user));

    await expect(
      resolveMembership({ productOwner: { azureId: 'azure-1' }, technicalLead: { azureId: 'azure-1' } }),
    ).rejects.toThrow(/more than one membership slot/);
  });

  it('rejects more than ten additional users', async () => {
    await expect(
      resolveMembership({
        productOwner: { azureId: 'azure-1' },
        technicalLead: { azureId: 'azure-2' },
        additionalUsers: new Array(11).fill({ azureId: 'azure-x' }),
      }),
    ).rejects.toThrow(/at most 10 additional users/);
  });
});

describe('revokeAllRealmAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('strips access but keeps membership so a restore can re-provision it', async () => {
    const member = buildMember(MemberRoleEnum.PRODUCT_OWNER, { idirUsername: 'po', guid: 'guid-po' });
    (prisma.userRoster.findMany as jest.Mock).mockImplementation(() => Promise.resolve([member]));
    (prisma.userRoster.updateMany as jest.Mock).mockImplementation(() => Promise.resolve({ count: 1 }));

    await revokeAllRealmAccess(appliedRealm as any);

    expect(syncUserAccess).toHaveBeenCalledTimes(3);
    expect(prisma.userRoster.deleteMany).not.toHaveBeenCalled();
    // Clearing synced_at is what makes the restore reconcile pick them back up.
    expect((prisma.userRoster.updateMany as jest.Mock).mock.calls[0][0]).toEqual({
      where: { rosterId: appliedRealm.id, removedAt: null },
      data: { syncedAt: null },
    });
  });
});

describe('needsSync', () => {
  it('is true for a pending add and a pending revoke, and false once settled', () => {
    const settled = buildMember(MemberRoleEnum.PRODUCT_OWNER, { guid: 'g1' });
    expect(needsSync([settled])).toBe(false);

    const pendingAdd = buildMember(MemberRoleEnum.PRODUCT_OWNER, { guid: 'g2' }, { syncedAt: null });
    expect(needsSync([pendingAdd])).toBe(true);

    const pendingRevoke = buildMember(
      MemberRoleEnum.ADDITIONAL,
      { guid: 'g3' },
      { removedAt: new Date(), revokedAt: null },
    );
    expect(needsSync([pendingRevoke])).toBe(true);

    const revoked = buildMember(
      MemberRoleEnum.ADDITIONAL,
      { guid: 'g4' },
      { removedAt: new Date(), revokedAt: new Date() },
    );
    expect(needsSync([revoked])).toBe(false);
  });

  it('ignores members that never resolved, which can never settle', () => {
    const unresolvable = buildMember(MemberRoleEnum.ADDITIONAL, { guid: null }, { syncedAt: null });
    expect(needsSync([unresolvable])).toBe(false);
    expect(countUnresolvedMembers([unresolvable])).toBe(1);
  });
});
