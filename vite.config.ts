import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  server: { host: true, port: 5173 },
  build: {
    target: "es2020",
    sourcemap: true,
    chunkSizeWarningLimit: 1600, // Phaser is ~1.4MB; intentionally one vendor chunk
    rollupOptions: {
      output: {
        manualChunks: { phaser: ["phaser"] },
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "icons/apple-touch-icon.png"],
      workbox: {
        // Precache everything (incl. the Phaser vendor chunk) for full offline play.
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: "Block Blast",
        short_name: "Block Blast",
        description: "A satisfying block puzzle — drop, clear lines, chase combos.",
        theme_color: "#3b4fd6",
        background_color: "#2a3170",
        display: "standalone",
        orientation: "portrait",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
