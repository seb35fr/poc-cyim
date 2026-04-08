import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const graphqlUrl = env.VITE_GRAPHQL_URL || "http://gql.prod-k8s.groupe.zzroot.com/graphql";
  const url = new URL(graphqlUrl);

  return {
    plugins: [vue()],
    server: {
      port: 5174,
      host: true,
      proxy: {
        "/api/graphql": {
          target: url.origin,
          changeOrigin: true,
          rewrite: () => url.pathname,
        },
      },
    },
  };
});
