import { defineConfig } from 'vite';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/').pop();
const isUserPage = repositoryName?.endsWith('.github.io');

export default defineConfig({
  root: '.',
  base: process.env.BASE_PATH || (process.env.GITHUB_ACTIONS && repositoryName
    ? (isUserPage ? '/' : `/${repositoryName}/`)
    : './'),
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
  },
  server: {
    port: 3000,
    open: true,
  },
});
