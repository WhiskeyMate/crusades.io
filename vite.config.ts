import path from "node:path";
import { defineConfig } from "vite";

const pkg = (name: string) => path.resolve(__dirname, "packages", name, "src");

export default defineConfig({
  resolve: {
    alias: [
      { find: /^resources\//, replacement: path.resolve(__dirname, "resources") + "/" },
      { find: /^@vassal\/engine-api\//, replacement: pkg("engine-api") + "/" },
      { find: /^@vassal\/engine-lib\//, replacement: pkg("engine-lib") + "/" },
      { find: /^@vassal\/engine\//, replacement: pkg("engine") + "/" },
      { find: /^@vassal\/zbin$/, replacement: pkg("zbin") + "/index.ts" },
    ],
  },
  worker: { format: "es" },
  server: { port: 5183 },
  build: { target: "es2022", chunkSizeWarningLimit: 2000 },
});
