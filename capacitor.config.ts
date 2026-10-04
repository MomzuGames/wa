import type { CapacitorConfig } from '@capacitor/cli';

// The iPhone app: the game's `--mode app` build bundled inside a native shell.
const config: CapacitorConfig = {
  appId: 'com.momogames.chowa',
  appName: 'Chōwa',
  webDir: 'dist',
  backgroundColor: '#0B0B10',
  ios: {
    // The canvas fills the whole screen; the game keeps its buttons clear of the notch itself.
    contentInset: 'never',
    scrollEnabled: false,
    preferredContentMode: 'mobile',
  },
};

export default config;
