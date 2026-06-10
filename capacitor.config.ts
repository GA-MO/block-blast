/**
 * Capacitor configuration.
 *
 * `@capacitor/cli` reads this file (default export) during `npx cap init`,
 * `npx cap sync`, and build commands. We intentionally DO NOT
 * `import type { CapacitorConfig } from "@capacitor/cli"` here so the
 * project still type-checks before the Capacitor packages are installed.
 * The shape below mirrors `CapacitorConfig`.
 */

interface SplashScreenConfig {
  launchShowDuration?: number;
  launchAutoHide?: boolean;
  backgroundColor?: string;
  showSpinner?: boolean;
  androidScaleType?: string;
  splashFullScreen?: boolean;
  splashImmersive?: boolean;
}

interface CapacitorConfigShape {
  /** Reverse-DNS app id. NOTE: placeholder — change before publishing. */
  appId: string;
  appName: string;
  /** Folder Vite builds the web assets into. */
  webDir: string;
  backgroundColor?: string;
  server?: {
    androidScheme?: string;
    iosScheme?: string;
    /** Set to a dev-server URL for live reload; leave unset for production. */
    url?: string;
    cleartext?: boolean;
  };
  plugins?: {
    SplashScreen?: SplashScreenConfig;
    [key: string]: unknown;
  };
}

const config: CapacitorConfigShape = {
  // TODO: `com.blockblast.game` is a PLACEHOLDER. Register your own
  // reverse-DNS identifier in App Store Connect / Play Console and update here.
  appId: "com.blockblast.game",
  appName: "Block Blast",
  webDir: "dist",
  backgroundColor: "#0e1320",
  server: {
    androidScheme: "https",
    iosScheme: "https",
    // url: "http://192.168.1.10:5173", // TODO: uncomment for native live-reload dev.
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#0e1320",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
