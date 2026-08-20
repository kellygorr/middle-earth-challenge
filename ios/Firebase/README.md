# Firebase iOS configuration

The release app uses an iOS client in the existing `middle-earth-challenge`
Firebase project. It uses the same Firebase Auth and Firestore backend as
Android:

| Xcode configuration | Bundle ID                  | Required file                      |
| ------------------- | -------------------------- | ---------------------------------- |
| Release             | `com.middleearthchallenge` | `Release/GoogleService-Info.plist` |

The Xcode build copies this file into the application bundle as
`GoogleService-Info.plist`. Debug iOS builds remain intentionally unconfigured
until a `com.middleearthchallenge.debug` Firebase app is registered and its
configuration is placed at `Debug/GoogleService-Info.plist`.
