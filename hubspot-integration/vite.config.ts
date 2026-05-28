import { defineConfig } from "vite";

const wixPlatformModules = ["wix-site-backend"];

export default defineConfig({
  optimizeDeps: {
    exclude: wixPlatformModules,
  },
  build: {
    rollupOptions: {
      external: wixPlatformModules,
    },
  },
  ssr: {
    external: wixPlatformModules,
  },
});
