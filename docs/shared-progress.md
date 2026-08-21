# Shared Progress

## Status

The Friend Progress UI, workflow, sync cadence, participant caching, and map
presentation are implemented.

**The invite-only group model described below was not built and is not
planned.** The app serves a single closed friend group, so every authenticated
user is a member of the one implicit group and any authenticated user can read
the participant collection. That is an accepted decision, not a gap — see
`docs/adversarial-code-review.md`, "Friends data is globally enumerable". The
group, invite, membership, and `userGroups` sections of this document are
retained as design notes for a future multi-group release and describe nothing
that currently exists.

This feature lets users opt in to sharing their total journey distance and see
other participating users' progress. It is independent of activity tracking:
pedometer, health data, and manual entries all converge into the same local
journey total before anything is published.

## Goals

- Let a private, invite-only group see one another's journey progress.
  *(Deferred — currently one implicit group.)*
- Keep sharing optional and off by default.
- Share only the minimum data needed for the experience.
- Continue treating local progress as the app's source of truth.
- Work for users with any tracking source or no automatic source.

## Privacy boundary

When sharing is enabled, publish only:

- a user-selected display name;
- the aggregate journey distance;
- the time that distance was last published.

Do not publish:

- raw Health Connect or Apple Health records;
- pedometer samples or step history;
- manual-entry history;
- routes, locations, or timestamps for individual activity;
- tracking-source or permission details.

The opt-in flow must explain exactly what is shared. Opting out deletes the
user's shared-progress row and stops ordinary cloud requests. Local journey
progress remains intact.

## Backend

Use Firebase for:

- Cloud Firestore storage;
- anonymous authentication;
- Firestore Security Rules;
- optional account linking later if cross-device recovery is added.

Each installation signs in anonymously when the user opts in. There is no login
screen, email address, password, or other user credential. The Firebase UID is
private and determines which documents that installation may update; it is
never displayed or used as an invite code.

The globally readable `friend_progress` and `friend_progress_debug`
collections are legacy pre-release schemas. Deny their reads before enabling
private groups and delete their rows rather than migrating them into a group.

The first private-group release allows each anonymous UID to belong to at most
one group:

```text
groups/{groupId}
- ownerId: uid
- memberCount: number
- createdAt: server timestamp

groups/{groupId}/members/{uid}
- role: "owner" | "member"
- joinedAt: server timestamp
- joinedViaInviteId: string | null

groups/{groupId}/participants/{uid}
- displayName: string
- affinity: string
- distanceMiles: number
- updatedAt: server timestamp

groups/{groupId}/invites/{inviteId}
- createdBy: uid
- createdAt: server timestamp
- expiresAt: timestamp
- maxUses: number
- useCount: number
- revokedAt: timestamp | null

userGroups/{uid}
- groupId: groupId
```

Security Rules reject invalid fields, blank names, invalid affinities, and
negative distances. Group membership, not authentication alone, authorizes
participant reads. Participant writes remain owner-only and `updatedAt` is
assigned with a server timestamp.

## Groups and invites

Creating a group, its owner membership, and the owner's `userGroups/{uid}`
lookup is one atomic Firestore transaction. The group ID is random and
unguessable. The owner may create and revoke invites for that group. The
per-UID lookup is readable only by that UID and lets the client restore its
group without a collection-group query; Rules use it to enforce the one-group
limit.

An invite is a client-generated bearer value containing the group ID and at
least 128 bits of random secret material. Store a SHA-256 hash of the secret as
`inviteId`; never store the raw secret. Firestore permits an authenticated
anonymous user to `get` that exact invite path but denies invite collection
listing. Knowing only a group ID must not reveal its invites.

Joining is an atomic Firestore transaction that increments `useCount` and the
group's bounded `memberCount` by one, then creates both
`members/{request.auth.uid}` and `userGroups/{request.auth.uid}`. The membership
uses `role: "member"` and the same `joinedViaInviteId`. Rules require that both
UID documents did not exist before the transaction, the invite is not expired
or revoked, `useCount < maxUses`, and both post-transaction counts are exactly
one greater. The related writes require one another through `getAfter()` so no
partial redemption can commit.

This first release needs no email/password login, account-linking flow, or
trusted Cloud Function. The invite secret is a capability: anyone who receives it can join until it
expires, is revoked, or reaches its usage limit. The UI must call this out when
an owner creates an invite. A short human-entered code is not sufficient unless
it retains at least 128 bits of entropy; sharing should normally use the system
share sheet or a deep link.

Anonymous credentials are retained by Firebase on the installation, so normal
app restarts do not require any action. Reinstalling the app or clearing its
data can create a new UID and lose group access. Cross-device or reinstall
recovery remains out of scope unless optional account linking is designed
later.

## Identity and display names

- Require the user to enter a first name during opt-in.
- Provide a locally generated, editable trail surname such as `Greycloak`.
- The generator changes only the surname and uses original pastoral-fantasy
  name parts rather than names from existing works.
- Show the combined group-visible display name, such as `Penny Greycloak`, before the
  user confirms opt-in.
- The display name is visible to group members and editable after opt-in.
- Duplicate display names are allowed.
- Do not add traveler codes for the initial family-focused version.
- Always update rows by the private UUID, never by display name.
- Changing a display name updates the existing row so the old name disappears.
- Persist the confirmed display name locally to prefill the UI across sessions.
  Clear it when the user opts out. Participant names shown on the map still come
  from fetched Firestore documents.

A reinstall may create a new anonymous identity and leave abandoned membership
and participant rows. Credential recovery and stale-row cleanup are deferred
decisions.

## Published distance

Publish the app's aggregate local journey distance after health data, pedometer
commits, and manual entries have converged into progress state.

Use an absolute distance value:

```text
distance_miles = current local journey total
```

Never publish a distance delta such as "add 2 miles." Opt-in creates the row
with the display name and current distance. Routine syncs update only
`distance_miles`; editing the name updates only `display_name`. Absolute distance
values make retries idempotent, prevent duplicate additions, and allow local
entry deletion to reduce the published total correctly.

Skip an upload when the local distance has not changed. Only one publish/fetch
cycle may run at a time.

## Publish and fetch cadence

Implemented in `src/hooks/useFriendProgressSync.ts`. While opted in:

- App launch or foreground resume: publish changed local distance, then fetch
  other users' latest progress.
- Foreground: repeat the publish/fetch cycle every two minutes, skipped while
  the app is not active.

Designed but **not implemented**:

- App entering the background: publish once if distance changed. The AppState
  listener only fires a sync on the transition *to* active.
- Android pedometer background commit: best-effort publish after the
  WorkManager commit. `pedometerBackgroundTask` does not touch friend progress.
- Shared-progress view: manual pull-to-refresh. There is no `RefreshControl`;
  the two-minute cycle and the resume trigger are the only refresh paths.

While backgrounded, do not run a separate cloud polling timer. Mobile platforms
cannot reliably guarantee five-minute background execution, and other users'
progress is not needed until the app is active again.

Health-data users naturally publish after opening the app because that is when
new health distance is imported. Manual-only users publish after their local
progress changes and the next eligible cycle runs.

While opted out, perform no cloud requests.

## Retrieval and presentation

Fetch each participant in the current user's group:

- display name;
- aggregate distance;
- last-updated timestamp.

The initial experience should place participating users along the existing map
path according to their aggregate distance. It must handle:

- duplicate display names;
- multiple users at similar distances;
- loading, empty, offline, and stale states;
- progress beyond the final checkpoint;
- the current user versus other users.

The exact map marker and shared-progress list designs remain unresolved.

## Settings and opt-in modal

Shared Progress is separate from health and pedometer syncing. A user may share
journey progress while using only manual entries, so do not place its controls
inside the health-sync modal or mix its privacy copy with health permissions.

Add a **Share journey progress** row at the end of the Settings sync section.
Show `Off` while disabled and `On · {display name}` while enabled. Selecting the
row opens a dedicated Shared Progress modal.

The modal includes:

- a privacy section listing exactly what is shared: group-visible display name,
  aggregate journey distance, and last-updated time;
- a privacy section listing what is never shared: health records, step history,
  routes, locations, and individual manual or automatic activity entries;
- an explanation that opting out deletes the cloud row without deleting local
  journey progress;
- a required first-name field;
- an editable generated trail-surname field;
- a **Generate name** action that changes only the surname;
- a preview of the combined group-visible display name;
- a **Start sharing** action that remains disabled until the name is valid.

Generate names locally. Do not start an anonymous Firebase session or upload
any value until the user selects **Start sharing**. After opt-in, the same modal provides
sharing status, display-name editing, the privacy details, and a **Stop sharing**
action.

## Security requirements

Firestore Security Rules must ensure:

- unauthenticated clients cannot read or write sharing data;
- a user may read a group and its participants only when
  `groups/{groupId}/members/{request.auth.uid}` exists;
- a user may create, update, or delete only their own participant row;
- participant documents retain the existing exact-field and value validation;
- participant identity comes from the document path, never a client-supplied
  UID or group field;
- membership documents are readable only by their subject and the group owner;
- each `userGroups/{uid}` document is readable only by that UID and may name
  only the group whose membership is created or removed in the same atomic
  operation;
- only the owner may create or revoke an invite, and invite fields other than
  the transactionally incremented `useCount` are immutable;
- invite `get` is allowed only by exact unguessable path and invite `list` is
  denied;
- a caller may create only their own member document, with role `member`, as
  part of a valid invite-redemption transaction;
- no client may grant itself the owner role or change `ownerId`;
- collection-group participant queries and all reads of legacy
  `friend_progress` collections are denied.

Leaving atomically deletes the caller's participant, membership, and
`userGroups` documents and decrements `memberCount`. Removing a member is
restricted to the owner and applies the same operation. The first release must
cap group size so these operations and group cleanup fit in one Firestore batch.
Owner departure explicitly deletes the group and every subordinate document;
it must not silently transfer ownership. A UID may delete its own stale
`userGroups` lookup if its referenced group no longer exists, allowing recovery
from an interrupted or incomplete cleanup. Rules emulator tests must cover
non-member and cross-group reads, forged roles, direct membership creation,
partial invite redemption, exhausted/expired/revoked invites, member removal,
leaving, and owner deletion.

Keep the Firebase project on the Spark plan without a billing account. Firebase
client configuration is public metadata; access is protected by Authentication
and Firestore Security Rules.

## Opt-in flow

1. Explain that only display name and total journey distance are shared.
2. Require a first name, generate or accept an editable trail surname, and show
   the combined group-visible display name.
3. Require the user to explicitly select **Start sharing**.
4. Create or restore the anonymous Firebase session without showing a login.
5. Create a private group or redeem an invite if this installation is not
   already a member of one.
6. Insert the display name and current absolute journey distance in that group.
7. Persist the confirmed display name and enable sharing locally only after the
   cloud insert succeeds.
8. Fetch the current group's participants.

If setup fails, keep sharing disabled and preserve all local progress.

## Opt-out flow

1. Stop the foreground publish/fetch timer.
2. Atomically delete the user's participant and membership rows. If the user is
   the owner, explicitly delete the group and its subordinate data instead.
3. Clear the locally saved display name, cached shared participants, and
   publication metadata.
4. Keep the anonymous session only while needed to retry a failed deletion.
   After deletion succeeds, sign out and clear the secure local session.
5. Preserve all local journey progress.

Row existence is the cloud sharing state; no historical progress rows are kept.
Re-enabling sharing creates the row again with the user's current absolute
journey distance. If deletion fails, disable sharing locally immediately and
retry only the deletion until it succeeds. Do not publish or fetch progress
while deletion is pending.

## Data management

Add a separate **Delete shared data** row to the main **Manage data** modal. It
must be available independently of the Shared Progress modal and use the same
confirmed opt-out workflow:

1. Explain that the shared cloud row will be deleted and sharing will stop.
2. Explain that local journey progress will remain, but the saved display name
   will be removed.
3. Require destructive confirmation.
4. Disable ordinary sharing requests locally and delete the cloud row.
5. Clear cached participants and publication metadata after successful deletion.
6. If deletion fails, keep sharing disabled and persist a deletion-pending state
   that retries only the deletion when connectivity returns.

When no shared row exists and no deletion is pending, show a `No shared data`
state instead of an active delete button. Deleting only synced data or only
manual data does not affect sharing.

**Delete all data** must also delete the user's shared cloud row and opt the user
out. It clears local journey progress, cached participants, publication
metadata, and the locally saved display name. If the cloud deletion fails, the
local deletion still completes immediately, ordinary sharing requests remain
disabled, and the app retains only the secure anonymous session and persisted
deletion-pending state needed to retry the cloud deletion. Those retry artifacts
are removed after deletion succeeds.

The Settings **Data use** copy must no longer make the unconditional claim that
no data is sent to external servers. It should state that activity records and
local journey details remain on the device, while the dedicated Shared Progress
modal owns the complete disclosure for explicitly shared aggregate progress.

## Local state

Expected persisted local fields include:

```ts
sharingEnabled: boolean;
sharingDisplayName: string | null;
sharingDeletionPending: boolean;
lastPublishedMiles: number | null;
lastSharedProgressSyncAt: number | null;
```

Firebase Auth persists the anonymous session through its native platform SDK.

Fetched participant progress may be cached for offline display, but cloud data
must never be merged into the current user's local journey progress.

## Failure behavior

- Network unavailable: retain local progress and last fetched participant data.
- Publish failure: retry on the next eligible cycle without adding a delta.
- Fetch failure: continue showing cached data with its last-updated status.
- Authentication expired: refresh or recreate the anonymous session without
  changing local progress.
- App terminates mid-request: absolute upserts make retry safe.
- Opted out: do not retry ordinary publish/fetch requests; only a pending row
  deletion may be retried.

## Deferred decisions

- Stale-row retention and cleanup after reinstall or long inactivity.
- Anonymous-account recovery across reinstalls or devices.
- Display-name length and content rules.
- Map marker layout and shared-progress list presentation.
- Whether realtime subscriptions provide enough benefit over two-minute fetches.

## Implementation outline

1. Configure Firebase Anonymous Authentication, Firestore, and Security Rules.
2. Add the Firebase native app configuration and service adapter.
3. Add persisted sharing settings and publication metadata.
4. Implement opt-in, display-name editing, and opt-out.
5. Implement idempotent absolute-distance publishing.
6. Implement launch/resume and two-minute foreground triggers.
   *(Background-transition and Android pedometer-background triggers deferred.)*
7. Implement participant fetching and caching. *(Pull-to-refresh deferred.)*
8. Display participants along the map path.
9. Add offline/error/privacy states and device tests.

## Required tests

- Sharing defaults to off and makes no cloud requests.
- Opt-in requires a valid display name.
- Anonymous identity owns exactly one row.
- Authenticated participants can read all existing shared-progress rows.
- Unauthenticated clients cannot read shared-progress rows.
- Participants cannot update or delete another anonymous UUID's row.
- Duplicate display names are allowed.
- Editing a name updates the same UUID row.
- Publishing uses the absolute total and skips unchanged values.
- Retries cannot duplicate distance.
- A reduced local total replaces the larger cloud total.
- Launch/resume and two-minute foreground cycles publish then fetch.
- Concurrent cycles do not overlap.
- Background transition publishes changed distance once. *(Deferred — trigger
  not implemented.)*
- Android background pedometer commit triggers best-effort publishing.
  *(Deferred — trigger not implemented.)*
- Opt-out stops publish/fetch requests and deletes the cloud row.
- A failed opt-out deletion is retried without publishing or fetching progress.
- Delete shared data from Data Management performs the same confirmed opt-out
  and preserves local journey progress while deleting the full cloud row and
  locally saved display name.
- Delete all data also deletes shared cloud data, opts out, and clears the saved
  display name; a failed cloud deletion remains pending without blocking local
  deletion.
- Fetch failures retain cached participants without changing local progress.
- Cloud participant distance is never added to the current user's progress.

## Current priorities

Updated 2026-08-11. The earlier `participant_index` proposal was replaced by a
participant-selected `affinity`, which determines the marker color and is shown
in the UI as the Hobbit's place of origin.

1. [ ] Deploy Firestore Security Rules and verify the Firebase app configuration.
2. [x] Wire real participant fetching into the map store while preserving the
       development fake-data override.
3. [x] Publish changed distance and refresh participants on launch, resume, and
       every two minutes while foregrounded without overlapping cycles.
4. [x] Retry pending cloud deletion before any publish or fetch work.
5. [ ] Test the complete flow on a physical Android device: opt in, choose an
       affinity, rename, update distance, stop sharing, and rejoin.

Service/workflow tests, settings-store tests, the app render test, TypeScript,
and diff validation pass for the affinity and refresh-cadence implementation.
