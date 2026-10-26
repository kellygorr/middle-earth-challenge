# Firebase iOS configuration

The release app uses an iOS client in the existing `middle-earth-challenge`
Firebase project. It uses the same Firebase Auth and Firestore backend as
Android:

| Xcode configuration | Bundle ID                  | Required file                      |
| ------------------- | -------------------------- | ---------------------------------- |
| Release             | `com.middleearthchallenge` | `Release/GoogleService-Info.plist` |

The Xcode build copies this file into the application bundle as
`GoogleService-Info.plist`. Release builds fail when it is missing.

Debug iOS builds work without Firebase configuration. In that state, App
Check, anonymous authentication, Firestore, and Friend Progress are disabled;
the local map, manual entry, and Apple Health development surfaces remain
available. To enable Firebase features in Debug, register a
`com.middleearthchallenge.debug` Firebase app and place its configuration at
`Debug/GoogleService-Info.plist`.
