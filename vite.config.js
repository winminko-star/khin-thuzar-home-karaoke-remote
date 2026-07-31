import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png", "artists.csv"],
      manifest: {
        name: "Khin Thuzar Hlaing's Home Karaoke Remote",
        short_name: "Karaoke Remote",
        description: "Remote control for Home Karaoke",
        theme_color: "#5b21b6",
        background_color: "#09090b",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" }
        ]
      }
    })
  ]
});
