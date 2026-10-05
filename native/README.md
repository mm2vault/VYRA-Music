# VYRA native audio

VYRA keeps the GitHub Pages/PWA version unchanged. The Android build is created with Capacitor 8.

## Background playback

The native shell uses Android Media3 through @mediagrid/capacitor-native-audio. Supported audio sources can continue when the app is minimized or the screen is locked, with system media controls.

This does not extract or separate audio from YouTube. YouTube playback remains inside the official YouTube player and is not used as a hidden background-audio workaround.

Native background playback is reserved for:
- VYRA-owned or properly licensed remote audio URLs
- user-owned local audio files

The Android workflow builds a debug APK automatically on pushes to main or manually from GitHub Actions.
