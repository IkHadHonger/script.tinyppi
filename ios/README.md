# TinyPPI iOS 1.0

Native SwiftUI client for the TinyPPI 2.22.0 dashboard API.

## First run

1. In TinyPPI on the Kodi/CoreELEC box, enable **Settings → Dashboard** and
   **Allow VS10 switching from the dashboard** if player controls are wanted.
2. Use **Show address and token** and enter both in the app's Settings tab.
3. Keep the default port `8099`, unless it was changed on the box.

The app implements server configuration, `/api/hello`, polling of `/api/state`,
the Live information cards and player commands. Its library tab reads films,
series, continue-watching and next-up rows and can start or resume titles on
the Kodi box.

## Build

The Xcode project is generated from `project.yml`:

```sh
brew install xcodegen
xcodegen generate
open TinyPPI.xcodeproj
```

GitHub Actions builds and tests the simulator target and publishes an unsigned
device IPA. SideStore performs the personal Apple-ID signing during install.
