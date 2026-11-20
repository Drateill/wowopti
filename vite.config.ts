import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { blizzardApi } from './server/blizzard';

export default defineConfig(({ mode }) => {
  // Variables sans préfixe VITE_ : elles restent côté serveur et ne sont jamais envoyées au navigateur.
  const env = loadEnv(mode, process.cwd(), 'BLIZZARD_');
  return {
    plugins: [
      react(),
      blizzardApi({
        clientId: env.BLIZZARD_CLIENT_ID,
        clientSecret: env.BLIZZARD_CLIENT_SECRET,
        region: env.BLIZZARD_REGION,
        namespace: env.BLIZZARD_NAMESPACE,
      }),
    ],
    worker: { format: 'es' },
  };
});
