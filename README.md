# MOONLIGHT

MOONLIGHT is an [Expo](https://expo.dev) music app. Its launcher icon, in-app mark, and startup screen use the custom logo in `assets/images`.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

## Android media controls

The Android media notification includes previous/next track controls and stops when the
app is dismissed from Recents. These native changes require a new development build; they
are not available in Expo Go.

```bash
npx eas-cli@latest build --profile development --platform android
```

## Profile data

On first launch, enter a name, date of birth, and phone number. This profile is saved only
on the current device; it is not an online account and does not sync between devices.
Logging out clears the saved profile and returns to setup. Reinstalling the app or clearing
its local data also removes the profile. The profile is stored locally and is not encrypted,
so avoid saving details on a device other people can access.

## Google Drive music

The app reads audio and cover images from the configured Google Drive folder. To add a
cover manually, upload it to the same folder and name it
`moonlight-cover-<audio-file-id>.<extension>`, using the audio file's Drive ID. For example,
`moonlight-cover-1AbCxyz123.jpg`. Refresh Home to load Drive changes.

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
