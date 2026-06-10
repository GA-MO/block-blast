/**
 * In-app-purchase seam: product catalog + a stable purchase API.
 *
 * Design goals:
 *  - Compiles and runs WITHOUT any purchases plugin installed
 *    (web build stays functional). Native plugin is lazy-loaded via
 *    dynamic import inside try/catch.
 *  - Loosely coupled to the rest of the game: this file only defines the
 *    catalog and the purchase/restore seam. Granting entitlements (coins,
 *    cosmetics, remove-ads) is left to the caller / TODOs below so we don't
 *    tightly bind to `Economy` or `Ads` here.
 */

import { Analytics } from "./analytics";

export interface Product {
  id: string;
  type: "consumable" | "nonconsumable";
  title: string;
  description: string;
}

/**
 * Product catalog. The `id`s must match the product identifiers created in
 * App Store Connect and Google Play Console (and in RevenueCat, if used).
 * See docs/SHIP.md "Monetization setup".
 */
export const PRODUCTS: Product[] = [
  {
    id: "remove_ads",
    type: "nonconsumable",
    title: "Remove Ads",
    description: "Permanently removes interstitial ads.",
  },
  {
    id: "coins_small",
    type: "consumable",
    title: "Handful of Coins",
    description: "A small pack of coins.",
  },
  {
    id: "coins_large",
    type: "consumable",
    title: "Pile of Coins",
    description: "A large pack of coins at a better value.",
  },
  {
    id: "cosmetic_bundle",
    type: "nonconsumable",
    title: "Cosmetic Bundle",
    description: "Unlocks a bundle of skins and themes.",
  },
];

/**
 * Detect whether we are running inside a Capacitor native container.
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

class IAPManager {
  private native = false;
  private initialized = false;

  /**
   * Detect platform and prepare the store connection.
   * On native, lazy-load the purchases plugin; on web, no-op.
   * Never throws.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.native = isNativePlatform();

    if (!this.native) return;

    try {
      // TODO: choose a store layer and install it. Two common options:
      //   1) RevenueCat: `npm i @revenuecat/purchases-capacitor`
      //        const { Purchases } = await import("@revenuecat/purchases-capacitor");
      //        await Purchases.configure({ apiKey: "PUBLIC_SDK_KEY" }); // TODO: real key
      //   2) cordova-plugin-purchase (CdvPurchase) for direct StoreKit/Billing.
      //
      // The dynamic import below keeps this file compiling with the package absent.
      // The specifier is held in a variable so TypeScript does not try to
      // statically resolve (and error on) a package that may not be installed.
      const pkg = "@revenuecat/purchases-capacitor";
      const mod = await import(/* @vite-ignore */ pkg).catch(() => null);
      if (!mod) {
        this.native = false; // plugin missing -> behave like web
        return;
      }
      // TODO: configure the SDK and fetch offerings/products here.
    } catch {
      this.native = false;
    }
  }

  /** Return the static product catalog. */
  getProducts(): Product[] {
    return PRODUCTS.slice();
  }

  /**
   * Attempt to purchase a product by id.
   * Native: run the store purchase flow. Web/fallback: cannot buy, returns
   * `{ success: false }`. Never throws.
   */
  async purchase(id: string): Promise<{ success: boolean }> {
    if (!this.initialized) await this.init();

    const product = PRODUCTS.find((p) => p.id === id);
    if (!product) return { success: false };

    if (!this.native) {
      // TODO: purchases are not possible on the web build. Surface a message
      // in the UI ("available in the app store version") instead of buying.
      console.info("[iap] purchase ignored on web:", id);
      return { success: false };
    }

    try {
      // TODO: implement the real purchase flow with the chosen plugin, e.g.
      //   const { Purchases } = await import("@revenuecat/purchases-capacitor");
      //   const offerings = await Purchases.getOfferings();
      //   const pkg = /* find package matching `id` */;
      //   const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
      //   const success = /* check entitlement in customerInfo */;
      //
      // On success the CALLER should grant the entitlement, for example:
      //   - "remove_ads"      -> Ads.setRemoveAds(true)
      //   - "coins_small"     -> Economy.addCoins(N)
      //   - "coins_large"     -> Economy.addCoins(M)
      //   - "cosmetic_bundle" -> Economy.own("skin"/"theme", ...)
      // Kept decoupled here on purpose; see docs/SHIP.md.
      Analytics.track("purchase", { id, result: "native-stub" });
      return { success: false };
    } catch {
      return { success: false };
    }
  }

  /**
   * Restore previously purchased non-consumables. Native: ask the store to
   * restore. Web/fallback: no-op. Never throws.
   */
  async restore(): Promise<void> {
    if (!this.initialized) await this.init();
    if (!this.native) return;

    try {
      // TODO: implement restore with the chosen plugin, e.g.
      //   const { Purchases } = await import("@revenuecat/purchases-capacitor");
      //   const customerInfo = await Purchases.restorePurchases();
      //   // re-apply entitlements (e.g. remove_ads, cosmetic_bundle) from customerInfo.
      Analytics.track("purchase", { result: "restore-native-stub" });
    } catch {
      // Swallow: restore failures must not crash the app.
    }
  }
}

export const IAP = new IAPManager();
