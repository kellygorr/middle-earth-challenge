# Android Debug APK Build — Lessons Learned (Sept 2026)

## What went wrong today
Building a self-bundled debug APK from a fresh `git worktree` repeatedly failed with:

```
ninja: error: '.../react-native-worklets/android/build/intermediates/cmake/debug/obj/arm64-v8a/libworklets.so',
needed by '.../libreanimated.so', missing and no known rule to make it
```

**Root cause:** `react-native-reanimated`'s CMake config statically expects
`react-native-worklets`'s native `.so` output to already exist at
`.../react-native-worklets/android/build/intermediates/cmake/<variant>/obj/<abi>/libworklets.so`
(an older/legacy output path). Gradle's task graph does declare
`externalNativeBuildDebug` on reanimated depends on the same task on worklets,
but when **`node_modules` is copied wholesale from another worktree/build**
(instead of a clean `yarn install`), stale `.cxx`/`build` directories with
paths baked in from the *other* worktree confuse CMake's file-existence checks
and configuration cache, so the dependency doesn't actually re-run — it just
fails claiming the file is "missing."

## Why it kept recurring
Each retry reused the same half-copied/half-stale `node_modules`, so cleaning
only reanimated's `.cxx` wasn't enough — worklets' own `.cxx`/`build` dirs
also needed clearing, and even then the legacy `cmake/debug/obj` output only
gets populated by a full/explicit rebuild, not an incremental one.

## Do this next time — clean recipe for a from-scratch APK build in a new worktree

1. **NEVER copy `node_modules` from another worktree to "save time." This is
   a hard rule, not a suggestion.** On 2026-09-13 this exact shortcut turned a
   ~5-10 minute `yarn install` into roughly an HOUR of debugging a broken
   native build (see "What went wrong" above) — a strictly worse outcome than
   just waiting for the clean install in the first place. Always run
   `yarn install` (or `npm install`) fresh in any new worktree before building.
   If you ever catch yourself about to `cp -R`/`rsync` a sibling worktree's
   `node_modules` again: don't. Just run the install and wait.

2. **Always wipe these before the first build in a copied/reused
   `node_modules`:**
   ```bash
   find node_modules -maxdepth 4 -type d -name ".cxx" -exec rm -rf {} +
   find node_modules -maxdepth 3 -type d -path "*/android/build" -exec rm -rf {} +
   rm -rf android/app/build android/build android/.gradle
   ```

3. **Ensure `local.properties` has the correct `sdk.dir`** — this is not
   copied by git and worktrees don't inherit it:
   ```
   echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties
   ```

4. **Make sure `node`/`npx` are on PATH** in the shell running Gradle —
   a bare non-login shell may not have them:
   ```bash
   export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
   ```

5. **Build worklets explicitly first, then the full app:**
   ```bash
   ./gradlew :react-native-worklets:assembleDebug -q
   ./gradlew assembleDebug -q
   ```
   This forces worklets' native libs to populate the legacy `cmake/<variant>/obj/<abi>/`
   path reanimated's CMakeLists hardcodes, before reanimated's CMake
   configuration step reads it.

6. **If step 5 STILL fails with the same "missing .so" error (this is what
   actually happened on 2026-09-13 — steps 1-5 alone did NOT fix it), the AGP
   task that copies worklets' compiled `.so` into the legacy
   `cmake/<variant>/obj/<abi>/` path is silently not running (likely an
   up-to-date-check bug when the CXX build folder was previously copied/reused).
   Do the copy manually instead of retrying the full build blindly:**

   ```bash
   cd node_modules/react-native-worklets/android
   # Find the actual built .so (it DOES get compiled — just not copied to the legacy path)
   find build/intermediates/cxx -name "libworklets.so"
   # It will be under build/intermediates/cxx/Debug/<hash>/obj/<abi>/libworklets.so
   # Copy each ABI's .so into the legacy path reanimated's CMakeLists expects:
   SRC=build/intermediates/cxx/Debug/<hash>/obj   # replace <hash> with what `find` printed
   for abi in arm64-v8a armeabi-v7a x86 x86_64; do
     mkdir -p build/intermediates/cmake/debug/obj/$abi
     cp "$SRC/$abi/libworklets.so" "build/intermediates/cmake/debug/obj/$abi/libworklets.so"
   done
   cd ../../../android   # back to android/ dir
   ./gradlew assembleDebug -q
   ```

   This worked on the first try once applied — no other change was needed
   after this manual copy.

7. **Time-box it.** If a from-scratch build isn't producing an APK within
   ~15 minutes of active troubleshooting (not counting normal build time),
   stop iterating blindly and go straight to step 6's manual `.so` copy — that
   was the actual fix, not the CMake-cache-nuking in step 6's old advice.
   Don't repeat "clean + rebuild" more than twice before trying the manual
   copy; it wastes 10+ minutes per retry for no new information.

## Self-bundled debug APK notes
- `debuggableVariants = []` in `android/app/build.gradle` (`react { }` block)
  forces the JS bundle to be embedded in the debug APK (no Metro dependency)
  while keeping `android:debuggable=true`. This is what lets install/upgrade
  testing behave like a real device without a dev server attached.
- Revert this setting (restore the commented-out default) once
  upgrade-testing is done — it's meant to be temporary.

## Where the finished APK ends up
Debug APK output path (once build succeeds):
```
android/app/build/outputs/apk/debug/app-debug.apk
```
**Always copy this to `~/Desktop` with a clear versioned name immediately**
(e.g. `mec-1.1.4-selfbundled-debug.apk`) so it isn't lost across
worktree/build churn.
