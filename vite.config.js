import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const graphqlUrl = env.VITE_GRAPHQL_URL || "http://gql.prod-k8s.groupe.zzroot.com/graphql";
  const url = new URL(graphqlUrl);

  // Proxy ES uniquement en dev : evite CORS et garde l'IP interne hors du browser.
  // VITE_ES_URL doit pointer sur la racine du cluster (ex: http://192.168.201.176:9200).
  const esUrl = new URL(env.VITE_ES_URL || "http://192.168.201.176:9200");

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
        "/api/es": {
          target: esUrl.origin,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/es/, ""),
        },
      },
    },
  };
});
