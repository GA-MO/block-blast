# Block Blast — Release Runbook (SHIP.md)

This is the practical, end-to-end guide for shipping **Block Blast** (Phaser +
TypeScript + Vite) as:

1. a **web / PWA** build (static hosting), and
2. **native iOS / Android** apps wrapped with **Capacitor**, with monetization
   (ads + in-app purchases).

The codebase ships with thin **seams** so the web build works today and the
native integrations are drop-in:

- `src/systems/ads.ts` — `Ads` singleton (rewarded + interstitial).
- `src/systems/iap.ts` — `IAP` singleton + `PRODUCTS` catalog.
- `capacitor.config.ts` — Capacitor app config.

Search the seams for `// TODO:` — those mark exactly where store keys, ad unit
IDs, and plugin calls go.

---

## 1. Web / PWA deploy

The web build is plain static output.

```bash
npm run build          # outputs to dist/
npm run preview        # optional: serve dist/ locally to smoke-test
```

Deploy the `dist/` folder to any static host:

- **Netlify** — drag-and-drop `dist/`, or connect the repo with build command
  `npm run build` and publish directory `dist`.
- **Vercel** — framework preset "Vite", output dir `dist`.
- **Cloudflare Pages** — build command `npm run build`, output dir `dist`.

Notes:

- The PWA (manifest + service worker) is configured separately from this
  document; once deployed over HTTPS the app is installable from the browser.
- On web, `Ads.showRewarded()` resolves as **granted** (so the game stays
  playable) and `Ads.maybeShowInterstitial()` is a no-op. `IAP.purchase()`
  returns `{ success: false }` because purchases require the native store.

---

## 2. Capacitor wrap (iOS + Android)

### 2.1 Install Capacitor

```bash
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
```

### 2.2 Initialize

`capacitor.config.ts` is **already configured** (appId `com.blockblast.game`,
appName "Block Blast", `webDir: dist`). If you run `npx cap init` it will pick
up that file; you generally only need to add the native platforms:

```bash
npx cap add ios
npx cap add android
```

> **App id is a placeholder.** `com.blockblast.game` must be replaced with an
> identifier you own/registered in App Store Connect and Play Console. Update
> `appId` in `capacitor.config.ts` before adding platforms.

### 2.3 Build + sync the web assets into native

```bash
npm run build && npx cap sync
```

Run `npx cap sync` again after every web rebuild or plugin install.

### 2.4 Open the native projects

```bash
npx cap open ios       # opens Xcode    (macOS required)
npx cap open android   # opens Android Studio
```

- **iOS** requires **Xcode on macOS** + an Apple Developer account.
- **Android** requires **Android Studio** (SDK + JDK).

From there, set signing/team, bump build numbers, run on device, and archive
for upload.

---

## 3. Monetization setup

### 3.1 Ads (AdMob)

1. Create a **Google AdMob** account and register the iOS and Android apps.
2. Create ad units: one **Rewarded** and one **Interstitial** per platform.
   You will get `ca-app-pub-XXXX/UNIT_ID` strings.
3. Install the plugin:

   ```bash
   npm i @capacitor-community/admob
   npx cap sync
   ```

4. Wire it up in **`src/systems/ads.ts`**:
   - Uncomment the dynamic `import("@capacitor-community/admob")` blocks.
   - Replace the `// TODO:` ad unit id placeholders in `showRewarded()` and
     `maybeShowInterstitial()` with your real unit IDs (keep platform-specific
     IDs; use the AdMob **test** IDs during development).
   - Call `AdMob.initialize(...)` in `init()`.
5. iOS only: add the **GADApplicationIdentifier** to `Info.plist` and configure
   **SKAdNetwork** identifiers + an **App Tracking Transparency** prompt if you
   use IDFA. Android: add the AdMob **App ID** to `AndroidManifest.xml`.
6. `Ads.setRemoveAds(true)` is called after the `remove_ads` IAP — interstitials
   are then suppressed while rewarded ads keep working.

### 3.2 In-app purchases (IAP)

Choose **one** store layer:

- **RevenueCat** (recommended for cross-platform entitlements):
  ```bash
  npm i @revenuecat/purchases-capacitor
  npx cap sync
  ```
- or **native StoreKit / Play Billing** via `cordova-plugin-purchase`.

Then:

1. Create products in **App Store Connect** and **Google Play Console** whose
   identifiers **exactly match** the `id`s in `PRODUCTS` (`src/systems/iap.ts`):
   - `remove_ads` (non-consumable)
   - `coins_small` (consumable)
   - `coins_large` (consumable)
   - `cosmetic_bundle` (non-consumable)
2. Wire the `// TODO:` blocks in **`src/systems/iap.ts`**: configure the SDK in
   `init()`, implement `purchase()` and `restore()`.
3. **Grant entitlements in the caller** (kept decoupled in the seam):
   - `remove_ads` → `Ads.setRemoveAds(true)`
   - `coins_small` / `coins_large` → `Economy.addCoins(N)`
   - `cosmetic_bundle` → `Economy.own("skin" | "theme", id)`
4. Provide a visible **Restore Purchases** button (required by Apple) that calls
   `IAP.restore()`.

---

## 4. Store assets checklist

- [ ] **App icon** — 1024×1024 master PNG (no alpha for iOS). Generate the full
      icon set + adaptive Android icons from it.
- [ ] **Splash screen** assets matching the `SplashScreen` config in
      `capacitor.config.ts` (`backgroundColor: #0e1320`).
- [ ] **Screenshots** per required device class:
      - iOS: 6.7" and 6.5" iPhone (and iPad if supported).
      - Android: phone + 7"/10" tablet as applicable.
- [ ] **Privacy policy URL** — **required** because the app serves ads and sells
      IAP. Host a reachable URL and link it in both stores.
- [ ] **Age rating / content rating** questionnaires (App Store + Play).
- [ ] **App name + subtitle + description** — keep generic marketing copy:
      a fast, satisfying block-fitting puzzle; clear lines, chase high scores,
      unlock cosmetics. Avoid trademarked terms.
- [ ] **Keywords** (iOS) / short description (Android).
- [ ] **Support URL** and contact email.

---

## 5. Pre-submit checklist

- [ ] **Bump version + build number** (Xcode target / Android `versionCode`
      + `versionName`).
- [ ] Run `npm run build && npx cap sync` so native has the latest web bundle.
- [ ] **Test offline** — game launches and plays with no network; ad/IAP
      failures degrade gracefully (the seams never throw).
- [ ] **Test on real devices** (at least one iOS, one Android), not just
      simulators — verify rewarded grant, interstitial cadence, purchase +
      **restore**, and remove-ads suppression.
- [ ] **Privacy "nutrition labels" / Data safety form**:
      - Declare **IDFA / advertising identifier** usage for ads.
      - Add the **App Tracking Transparency** prompt on iOS if tracking.
      - Declare purchase data collection for IAP.
- [ ] Confirm the **privacy policy URL** is live and linked.
- [ ] Confirm `appId` in `capacitor.config.ts` matches the registered bundle
      id (not the `com.blockblast.game` placeholder).
- [ ] Submit for review; respond to any store metadata requests.
```
