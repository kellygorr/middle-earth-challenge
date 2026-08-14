# Shared Progress

## Status

The Friend Progress UI, workflow, sync cadence, participant caching, and map
presentation are implemented. The backend is migrating to Firebase Anonymous
Authentication and Cloud Firestore on the Spark plan.

This feature lets users opt in to sharing their total journey distance and see
other participating users' progress. It is independent of activity tracking:
pedometer, health data, and manual entries all converge into the same local
journey total before anything is published.

## Goals

- Let a small group see one another's journey progress.
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

Each installation silently creates an anonymous account when the user opts in.
The Firebase user UID is private and determines which document that installation
may update. It is never displayed or used as a share code. The initial version has
no groups, invitations, friendships, or public traveler identifiers.

Each user owns one document in the `friend_progress` collection:

```text
friend_progress/{uid}
- displayName: string
- affinity: string
- distanceMiles: number
- updatedAt: server timestamp
```

Security Rules reject invalid fields, blank names, invalid affinities, and
negative distances. They allow authenticated reads and owner-only create,
update, and delete operations. `updatedAt` is assigned with a server timestamp.

## Identity and display names

- Require the user to enter a first name during opt-in.
- Provide a locally generated, editable trail surname such as `Greycloak`.
- The generator changes only the surname and uses original pastoral-fantasy
  name parts rather than names from existing works.
- Show the combined public display name, such as `Penny Greycloak`, before the
  user confirms opt-in.
- The display name is public and editable after opt-in.
- Duplicate display names are allowed.
- Do not add traveler codes for the initial family-focused version.
- Always update rows by the private UUID, never by display name.
- Changing a display name updates the existing row so the old name disappears.
- Persist the confirmed display name locally to prefill the UI across sessions.
  Clear it when the user opts out. Participant names shown on the map still come
  from fetched Firestore documents.

A reinstall may create a new anonymous identity and leave an abandoned row.
Account recovery and stale-row cleanup are deferred decisions.

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

While opted in:

- App launch or foreground resume: publish changed local distance, then fetch
  other users' latest progress.
- Foreground: repeat the publish/fetch cycle every two minutes.
- App entering the background: publish once if distance changed.
- Android pedometer background commit: best-effort publish after the existing
  approximately four-hour WorkManager commit.
- Shared-progress view: allow manual pull-to-refresh.

While backgrounded, do not run a separate cloud polling timer. Mobile platforms
cannot reliably guarantee five-minute background execution, and other users'
progress is not needed until the app is active again.

Health-data users naturally publish after opening the app because that is when
new health distance is imported. Manual-only users publish after their local
progress changes and the next eligible cycle runs.

While opted out, perform no cloud requests.

## Retrieval and presentation

Fetch each opted-in user's latest:

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

- a privacy section listing exactly what is shared: public display name,
  aggregate journey distance, and last-updated time;
- a privacy section listing what is never shared: health records, step history,
  routes, locations, and individual manual or automatic activity entries;
- an explanation that opting out deletes the cloud row without deleting local
  journey progress;
- a required first-name field;
- an editable generated trail-surname field;
- a **Generate name** action that changes only the surname;
- a preview of the combined public display name;
- a **Start sharing** action that remains disabled until the name is valid.

Generate names locally. Do not create an anonymous account or upload any value
until the user selects **Start sharing**. After opt-in, the same modal provides
sharing status, display-name editing, the privacy details, and a **Stop sharing**
action.

## Security requirements

Firestore Security Rules must ensure:

- an authenticated anonymous user may insert and update only their own row;
- a user may delete only their own row;
- clients cannot write another user's distance or display name;
- authenticated app users may read every existing shared-progress row;
- unauthenticated clients cannot read shared-progress rows.

Row existence represents opt-in. There is no group or invitation layer in the
initial version: authenticated participants see all users who currently have a
shared-progress row. The private UUID distinguishes users with duplicate display
names but is not included in the participant data presented by the app.

Keep the Firebase project on the Spark plan without a billing account. Firebase
client configuration is public metadata; access is protected by Authentication
and Firestore Security Rules.

## Opt-in flow

1. Explain that only display name and total journey distance are shared.
2. Require a first name, generate or accept an editable trail surname, and show
   the combined public display name.
3. Require the user to explicitly select **Start sharing**.
4. Create or restore the anonymous Firebase session.
5. Insert the display name and current absolute journey distance.
6. Persist the confirmed display name and enable sharing locally only after the
   cloud insert succeeds.
7. Fetch all current participants.

If setup fails, keep sharing disabled and preserve all local progress.

## Opt-out flow

1. Stop the foreground publish/fetch timer.
2. Delete the user's cloud row.
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
6. Implement launch/resume, two-minute foreground, background-transition, and
   Android pedometer-background triggers.
7. Implement participant fetching, caching, and pull-to-refresh.
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
- Background transition publishes changed distance once.
- Android background pedometer commit triggers best-effort publishing.
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
