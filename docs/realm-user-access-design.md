# Realm User Access Management

Design for normalising realm membership and automating master-realm access control.

## Background

Three problems motivate this work.

**Access is only granted, never revoked.** When a realm is approved, the product owner and technical lead are given
access via a direct role assignment in the master realm. When those contacts are later _changed_, nothing is
provisioned or de-provisioned — an email goes out asking the team to update access themselves. That request cannot be
satisfied, because teams can administer their own realm but not `master`.

**Restore still uses the retired IDIR path.** `pages/api/realms/[id]/restore.ts` looks users up over SOAP and builds a
`<guid>@idir` username, while the approval path in `pages/api/realms/[id]/index.ts` already uses MS Graph and
`<guid>@azureidir`. Both also iterate with `forEach(async …)`, so nothing is awaited and failures escape the
surrounding `try`/`catch`.

**The master-vs-realm distinction is confusing.** The rules are currently conveyed through long instructional emails
(`onboardNewRealmAdmin` / `offboardRealmAdmin`) that are hard to follow during onboarding.

## Goals

- Product owner and technical lead are required; up to 10 additional users are optional.
- Changing a contact automatically revokes the previous account and grants the new one.
- Failures are tracked per member, reported to the SSO team, and retryable from the admin dashboard.
- Access is granted through the master-realm group rather than direct role assignment.
- Removing a member strips both group membership and any direct role assignment, so existing direct assignments drain
  toward group membership over time.
- Users are normalised out of `rosters` into `users` and a `users_rosters` join table.

## Out of scope

Cleaning up realm access that was never granted through this form. Users have historically been given access manually,
and that access must survive. **Only members actively removed through the form have their access stripped.** No
reconciliation pass may diff against, or remove, an account this application did not grant.

## Data model

```
users
  id             serial PK
  guid           varchar UNIQUE NULL   -- Graph onPremisesExtensionAttributes.extensionAttribute12
  idir_username  varchar NOT NULL      -- Graph mailNickname / onPremisesSamAccountName
  email          varchar
  display_name   varchar
  resolved_at    timestamptz NULL      -- NULL = never resolved in Graph
  created_at / updated_at

  UNIQUE (lower(idir_username))
```

`guid` is the identity key: it is stable across name and email changes, and it is what the Keycloak master username is
built from (`<guid>@azureidir`). It is nullable so that historical contacts who no longer exist in Graph can still be
represented. Because Postgres permits multiple `NULL`s in a unique column, the unique index on `lower(idir_username)`
is what actually dedupes unresolved rows.

Rows in `users` are **never hard-deleted**. Removing someone from a realm deletes nothing here; the row may end up
belonging to no realm at all. This is what lets `users_rosters` hold a plain foreign key rather than snapshotting
identity.

```
users_rosters
  id           serial PK
  user_id      int NOT NULL -> users(id)
  roster_id    int NOT NULL -> rosters(id) ON DELETE CASCADE
  role         varchar NOT NULL CHECK IN ('product_owner', 'technical_lead', 'additional')
  synced_at    timestamptz NULL   -- access confirmed in every environment
  removed_at   timestamptz NULL   -- tombstone: membership ended
  revoked_at   timestamptz NULL   -- access withdrawn in every environment
  created_at / updated_at

  UNIQUE (roster_id, user_id)                          WHERE removed_at IS NULL
  UNIQUE (roster_id) WHERE role = 'product_owner'      AND removed_at IS NULL
  UNIQUE (roster_id) WHERE role = 'technical_lead'     AND removed_at IS NULL
```

The flat contact columns on `rosters` (`product_owner_*`, `technical_contact_*`, `second_technical_contact_*`) are
**kept but no longer read or written**. They are dropped in a follow-up change once the migration is verified in
production, which keeps rollback to a redeploy of the previous image against unchanged schema.

## Migration and backfill

`helm/webapp/migration.sql` creates the tables and indexes, following the existing idempotent `IF NOT EXISTS` style.

`scripts/backfill-users.js` then populates them. It must be idempotent and re-runnable, and it prints a summary report
rather than assuming a clean run — the number of unresolvable contacts in production is not known in advance.

Slot mapping:

| `rosters` column             | `users_rosters.role` |
| ---------------------------- | -------------------- |
| `product_owner_*`            | `product_owner`      |
| `technical_contact_*`        | `technical_lead`     |
| `second_technical_contact_*` | `additional`         |

Two cases need handling.

**Contact does not resolve in Graph.** Create the `users` row with `guid` and `resolved_at` left `NULL`, preserving the
historical record. Such rows are excluded from every sync (`WHERE guid IS NOT NULL`) and are surfaced as a count on the
admin dashboard.

**The same person occupies two slots.** Today nothing prevents one person being both product owner and technical
contact, and `UNIQUE (roster_id, user_id)` forbids it. Keep the highest role by precedence
`product_owner > technical_lead > additional`, skip the duplicate, and log it.

> A roster can therefore emerge from migration with **no technical lead**, while the validator requires one. The next
> person to edit that realm is forced to fill the slot before they can save anything else. This is accepted friction on
> legacy data, not a bug.

## Access control model

`getRealmPermissionsByRole` (`utils/helpers.ts`) already defines the master-realm group
`${realm} Realm Administrator`, mapped to the role `${realm}-realm-admin`, and `createCustomRealm` creates it — but
nothing has ever added a member to it. All three roles now join that one group; the distinction between product owner,
technical lead and additional user is a registry concept only and has no Keycloak equivalent.

```
syncUserAccess(realm, env, user, action):
  1. ensure master role  `${realm}-realm-admin`           -- if missing: fail (realm is not provisioned)
  2. ensure master group `${realm} Realm Administrator`   -- if missing: create and map the role
  3. ensure master user  `<guid>@azureidir`               -- create + federated identity link if absent
  4. add    -> join group
     remove -> leave group AND delete the direct realm role mapping
```

Step 2 is self-healing: realms provisioned by the retired terraform path have the role but no group, and converge the
first time a membership changes.

Because nothing other than this application writes group membership, the application can safely own the group
outright. Legacy manual grants are _direct role assignments_, which are only ever touched for a member being explicitly
removed — which is exactly the out-of-scope boundary above.

## Reconciliation

There is no task or outbox table. Membership is desired state, and almost everything is derivable from it:

- **Adds** — derivable. A row with `removed_at IS NULL` should be in the group.
- **Group removals** — derivable. The application owns group membership entirely.
- **Direct role strips** — _not_ derivable. "Absent from `users_rosters`" is equally true of the legacy manual grantees
  that must not be touched, so an explicit record is required.

Tombstones carry that record. A removal or contact swap sets `removed_at` and inserts the new row; `revoked_at` is set
only once access is withdrawn everywhere. Repeated changes therefore accumulate rather than collapse:

```
PO A -> B, prod fails:
  row(A)  removed_at = now, revoked_at = NULL
  row(B)  active, synced_at = NULL          -- dev/test succeeded, prod did not

then PO B -> C, before any retry:
  row(A)  removed_at = now, revoked_at = NULL   -- still pending
  row(B)  removed_at = now, revoked_at = NULL   -- also pending
  row(C)  active

manual sync:
  for each env: revoke A, revoke B (group + direct role), ensure C in group
  all envs succeeded -> revoked_at set on A and B, synced_at set on C
```

A single `previous_guid` column cannot express this — it would silently drop A's revocation, leaving stale realm-admin
access — and it has nowhere to live at all when an additional user is simply deleted.

### Detecting pending work

A pure database predicate, requiring no Keycloak calls:

```sql
needs_sync(roster) =
  EXISTS (row WHERE removed_at IS NULL     AND synced_at  IS NULL)   -- add pending
     OR (row WHERE removed_at IS NOT NULL  AND revoked_at IS NULL)   -- revoke pending
```

This is separate from the existing realm-level `outOfSync` in `pages/api/realms.ts`, which checks whether the realm
itself exists and is enabled. That logic is unchanged.

### Ordering rules

- Process removals before adds.
- Skip a tombstone whose user has an active row on the same roster (removed then re-added before sync).
- Every operation is idempotent, so a retry may safely re-run environments that already succeeded.

### Triggers

One reconcile function serves every caller:

| Caller             | Scope                                        |
| ------------------ | -------------------------------------------- |
| Save (`PUT`)       | Changed rows only, awaited before responding |
| Approval           | All members, all environments                |
| Restore            | All members, all environments                |
| Manual sync button | All pending rows on the realm, all envs      |

A save typically changes one or two members, so awaiting it is cheap; a full reconcile of a 12-member realm is not, and
is reserved for the explicit paths. The manual sync button is admin-only, lives in the Actions column of the custom
realm dashboard alongside delete and restore, and is enabled when `needs_sync` is true.

### Failure handling

The database transaction commits regardless of Keycloak outcome. Failures leave `synced_at` / `revoked_at` `NULL`,
which is exactly what the sync button later picks up.

One summary email per attempt goes to the SSO team — not one per failure, so an environment outage during a bulk change
cannot flood the inbox:

```
To: bcgov.sso@gov.bc.ca
Subject: Realm access sync failed: <realm>

  user     env   action  error
  asmith   prod  add     ECONNREFUSED
  bjones   prod  remove  ECONNREFUSED

  dev and test succeeded. Retry from the admin dashboard.
```

> Because `synced_at` is only set on full success across every environment, a persistently degraded environment leaves
> every membership on that realm looking unsynced.

## Permissions

Membership edits:

|                  | PO slot | TL slot | Additional |
| ---------------- | ------- | ------- | ---------- |
| `product_owner`  | yes     | yes     | yes        |
| `technical_lead` | yes     | yes     | yes        |
| `additional`     | no      | no      | no         |
| `sso-admin`      | yes     | yes     | yes        |

Product owner and technical lead are symmetric **on membership only**. `productName`, `purpose` and `primaryEndUsers`
remain restricted to the product owner and admins, so `getUpdateRealmSchemaByRole` keeps three branches — membership
fields simply move into the shared schema. A disallowed slot returns `400` rather than being silently stripped.

Additional users are **view-only**: the realm appears on their dashboard so they can see what they hold, but they
cannot edit the roster or change membership. This prevents any one of ten people from removing the product owner or
each other. Existing second technical contacts lose edit rights as a result.

`getAllowedRealmNames` in `controllers/realm.ts` is deleted rather than ported — it has no callers, and its SQL has a
trailing comma before `FROM`.

## API contract

The client sends only the Azure object id from the picker. The server re-resolves identity from Graph and **ignores any
client-supplied guid, username or email**.

```
PUT /api/realms/[id]
{
  "productOwner":    { "azureId": "…" },
  "technicalLead":   { "azureId": "…" },
  "additionalUsers": [ { "azureId": "…" }, … ]     // max 10
}
```

Per changed entry the server queries Graph for
`onPremisesExtensionAttributes, onPremisesSamAccountName, mail, displayName`, upserts `users`, and links
`users_rosters`.

This matters because the stored guid is the direct provisioning key for realm-admin access; trusting a client-supplied
value would let any roster editor grant admin on an arbitrary account. A selection whose Graph record has no
`extensionAttribute12` is rejected with a validation error — unlike backfill, which tolerates `NULL` for historical
rows.

Validation also rejects the same user appearing in more than one slot, and enforces the 10-user cap on both the client
and the server.

`POST /api/realms/[id]/sync` is added for the manual retry, restricted to `sso-admin`.

## Emails

`onboardNewRealmAdmin` and `offboardRealmAdmin` are rewritten as confirmations. The manual grant and revoke
instructions and their screenshots are removed — the application now performs those steps — as is "Action required"
from the subject lines. Recipients become the affected user plus the product owner and technical lead.

Both send **only after full success**, so nobody is told they have access that was never provisioned.

The offboard email keeps one genuine instruction: roles and groups granted to that person _inside_ the custom realm are
not managed here and remain the team's to clean up.

## IDIR to AzureIDIR

Because `users.guid` is stored, restore needs no directory lookup at all — it simply reconciles.

- `restore.ts` drops `generateXML` / `makeSoapRequest` / `getBceidAccounts` and the unawaited `forEach(async …)`, and
  calls the shared reconcile.
- Unused `utils/idir` and `HttpsProxyAgent` imports are removed from `pages/api/azure-service/idir-user.ts` and
  `idir-users.ts`, which already run on Graph.
- `utils/idir.ts` and `pages/api/bceid-service/*` are left in place. They have no callers in this repository, but may
  serve an external consumer that cannot be verified from here.
- `pages/api/users/[id].ts` (the deleted-IDIR-user webhook) is ported to join through `users` / `users_rosters` on
  `idir_username`, and remains notification-only. It now also catches additional users, which the three-column lookup
  never could. It does not revoke: a spurious webhook call must not be able to strip a realm's only product owner.

## Frontend

`RealmForm` gains an additional-users section where rows are added and removed dynamically, up to 10. Each row uses the
same Graph-backed async email picker as the product owner and technical lead, with the IDIR username shown read-only.
Since `idir-users.ts` already calls Graph, the search response can `$select` the username and guid directly, removing
the second `getIdirUserId` round trip per selection.

The section appears on the initial request form as well as the edit form. Before approval the realm does not exist in
Keycloak, so rows are stored with `synced_at` `NULL` and provisioned by the reconcile that runs on approval. Declined
requests keep their rows and are never provisioned.

## Delivery

A single change, including the rework of the existing test fixtures and suites that key off the flat contact columns.

Accepted risks:

- The unresolvable-contact count is unknown until deploy day; if it is large, the dashboard warning will be noisy
  initially.
- Legacy rosters may emerge with no technical lead and block their next edit until one is set.
- A persistently degraded environment makes every membership on affected realms appear unsynced.
