# Firebase App Check Rollout

The app initializes Firebase App Check before Auth or Firestore use. Release
builds use Play Integrity on Android and App Attest with DeviceCheck fallback on
iOS. Development builds use the debug provider. Token auto-refresh is enabled.

Participant reads are limited to 50 documents per request and use document-ID
cursor pagination. The current map requests only the first page; callers can
request later pages explicitly without introducing an unbounded read path.

## Production rollout

- [x] Register Android app
      `1:648232041356:android:32a1f673de9b912ad734a9` with Play Integrity. The
      shipped release certificate SHA-256 is registered in Firebase.
- [x] Configure Play Integrity for exclusive distribution outside Google Play:
      do not require `PLAY_RECOGNIZED` or `LICENSED`, and require
      `MEETS_DEVICE_INTEGRITY`.
- [x] Register iOS app
      `1:648232041356:ios:8b26b2a0eb7a669bd734a9` with App Attest and the
      DeviceCheck fallback. Apple Team ID `6TP683V73J` is registered in
      Firebase.
- [x] Retain the one-hour token TTL for Play Integrity, App Attest, and
      DeviceCheck. Firestore enforcement is enabled.
- [x] Accept the Play Integrity API terms and enable
      `playintegrity.googleapis.com` for Cloud project `648232041356`. Play
      Console linking is not required for exclusive APK distribution outside
      Google Play.
- [x] Enable `firebaseappcheck.googleapis.com` for project `648232041356`.
      This is separate from the Play Integrity API. Device validation initially
      showed a placeholder-token fallback with a 403 until the API was enabled.
- [x] Install the production-signed Android build through its expected
      distribution path and exercise anonymous authentication plus Firestore
      reads and writes on a physical Android device. Verified: the
      `playIntegrity` provider selected with a null debug token, the log
      contained `Integrity key attestation record generated successfully`, and
      there was no placeholder-token fallback.
- [x] Metrics review superseded: the only Firestore client is the validated
      test device. Friend Progress is unreleased, shipped Android `1.1.3` uses
      no Firebase, and no iOS build exists.
- [ ] Deferred until a future iOS release: verify App Attest on physical iOS
      hardware. The iOS app is registered and configured but has never shipped.
- [x] Enable Firestore enforcement after the Android gates pass. No iOS build
      is in the field, so enforcement has no iOS clients to reject. Release and
      registered Debug builds completed Firestore server round trips after
      enforcement, and the Release build completed an enable/stop sharing cycle
      without leaving a participant document behind.

On 2026-08-28, an authenticated read of the production App Check Admin API
returned `ENFORCED` for
`projects/648232041356/services/firestore.googleapis.com`, with service
`updateTime` `2026-08-20T01:39:25.168767Z`. A successful response from this API
also confirms that `firebaseappcheck.googleapis.com` is enabled.

Enforcement applies to the whole Firestore service. That only matters once a
second platform ships. Verify iOS attestation before an iOS release, not before
enabling enforcement for Android.

Do not enable enforcement based only on simulator, emulator, or debug-provider
traffic. Debug tokens are secrets and must not be committed to the repository.
