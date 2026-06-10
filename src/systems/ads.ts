/**
 * Ad seam: abstracts rewarded + interstitial ads behind a stable API.
 *
 * Design goals:
 *  - Compiles and runs WITHOUT any Capacitor / AdMob package installed
 *    (web build must stay playable). Native plugin is lazy-loaded via
 *    dynamic import inside try/catch, so a missing package = graceful no-op.
 *  - Never throws to callers. Game logic can `await` freely.
 *
 * Usage in game:
 *  - `Ads.showRewarded()` to grant a free revive on game over.
 *  - `Ads.maybeShowInterstitial()` between runs (frequency-capped).
 */

import { Analytics } from "./analytics";

export type RewardedResult = { granted: boolean };

/** Show an interstitial at most once every N eligible calls. */
const INTERSTITIAL_EVERY_N = 3;

/** Simulated rewarded delay on web so the dev build feels real. */
const WEB_REWARDED_DELAY_MS = 300;

/**
 * Detect whether we are running inside a Capacitor native container.
 * Capacitor injects a `Capacitor` global with `isNativePlatform()`.
 */
function isNativePlatform(): boolean {
  try {
    const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor;
    return !!cap?.isNativePlatform?.();
  } catch {
    return false;
  }
}

class AdsManager {
  private native = false;
  private initialized = false;
  private interstitialCounter = 0;
  /** When true (e.g. via "remove_ads" IAP), interstitials are suppressed. */
  removeAds = false;

  /**
   * Detect platform and prepare the ad provider.
   * On native, lazy-load the AdMob plugin; on web, no-op.
   * Never throws.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.native = isNativePlatform();

    if (!this.native) {
      Analytics.track("game_start", { ads: "web-noop" });
      return;
    }

    try {
      // TODO: install `@capacitor-community/admob` and uncomment the real init.
      // The dynamic import keeps this file compiling when the package is absent.
      //
      //   const { AdMob } = await import("@capacitor-community/admob");
      //   await AdMob.initialize({
      //     // TODO: testingDevices / tagForChildDirectedTreatment as needed.
      //   });
      //
      // For now, attempt the import defensively; absence is a no-op.
      // The specifier is held in a variable so TypeScript does not try to
      // statically resolve (and error on) a package that may not be installed.
      const pkg = "@capacitor-community/admob";
      const mod = await import(/* @vite-ignore */ pkg).catch(() => null);
      if (!mod) {
        this.native = false; // plugin missing -> behave like web
        return;
      }
      // TODO: call (mod as any).AdMob.initialize(...) once IDs are configured.
    } catch {
      // Plugin missing or init failed -> degrade gracefully to web behavior.
      this.native = false;
    }
  }

  /**
   * Show a rewarded ad. Resolves `{ granted: true }` when the reward
   * should be granted. On web/fallback, resolves granted after a short
   * delay so the dev build is playable. Never throws.
   */
  async showRewarded(): Promise<RewardedResult> {
    if (!this.initialized) await this.init();

    if (!this.native) {
      await delay(WEB_REWARDED_DELAY_MS);
      Analytics.track("booster_used", { source: "rewarded-web" });
      return { granted: true };
    }

    try {
      // TODO: implement the real AdMob rewarded flow:
      //   const { AdMob, RewardAdPluginEvents } = await import("@capacitor-community/admob");
      //   await AdMob.prepareRewardVideoAd({
      //     adId: "ca-app-pub-XXXXXXXX/REWARDED_UNIT_ID", // TODO: real ad unit id
      //   });
      //   const reward = await AdMob.showRewardVideoAd();
      //   return { granted: !!reward };
      //
      // Until wired, fall back to granting so play is never blocked.
      await delay(WEB_REWARDED_DELAY_MS);
      Analytics.track("booster_used", { source: "rewarded-native-stub" });
      return { granted: true };
    } catch {
      // On any native failure, still grant so the player isn't punished.
      return { granted: true };
    }
  }

  /**
   * Maybe show an interstitial between runs. Frequency-capped to at most
   * once per `INTERSTITIAL_EVERY_N` eligible calls. Suppressed entirely
   * when `removeAds` is set. Web is a no-op. Never throws.
   */
  async maybeShowInterstitial(): Promise<void> {
    if (!this.initialized) await this.init();
    if (this.removeAds) return;

    this.interstitialCounter += 1;
    if (this.interstitialCounter % INTERSTITIAL_EVERY_N !== 0) return;

    if (!this.native) {
      Analytics.track("daily_play", { interstitial: "web-noop" });
      return;
    }

    try {
      // TODO: implement the real AdMob interstitial flow:
      //   const { AdMob } = await import("@capacitor-community/admob");
      //   await AdMob.prepareInterstitial({
      //     adId: "ca-app-pub-XXXXXXXX/INTERSTITIAL_UNIT_ID", // TODO: real ad unit id
      //   });
      //   await AdMob.showInterstitial();
      Analytics.track("daily_play", { interstitial: "native-stub" });
    } catch {
      // Swallow: an ad failure must never break the game loop.
    }
  }

  /** Toggle ad removal (called by the IAP seam after a "remove_ads" purchase). */
  setRemoveAds(on: boolean): void {
    this.removeAds = on;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const Ads = new AdsManager();
