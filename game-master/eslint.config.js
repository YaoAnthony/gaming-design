// ESLint：推荐规则 + TypeScript + React hooks 的两条规则（hooks 只能在顶层调用、依赖要写全）
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // 引擎边界：Phaser 一侧和 3D 一侧互不引入，只通过 src/protocol 和 Redux 说话；协议本身不依赖任何引擎
  {
    files: ['src/protocol/**/*.ts', 'src/rhythm/**/*.ts', 'src/audio/**/*.ts', 'src/platform/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { paths: ['phaser', 'three'], patterns: ['three/*', '@/game/*', '@/sprite/*', '@/stage3d/*', '@/world3d/*', '@/ui/*'] }] },
  },
  {
    files: ['src/game/**/*.ts', 'src/sprite/**/*.ts', 'src/particle/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { paths: ['three'], patterns: ['three/*', '@/stage3d/*', '@/world3d/*'] }] },
  },
  {
    files: ['src/stage3d/**/*.{ts,tsx}', 'src/world3d/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { paths: ['phaser'], patterns: ['@/sprite/*', '@/particle/*', '@/game/scenes/*', '@/game/core/*', '@/game/mechanics/*'] }] },
  },
  {
    files: ['vite.config.ts', 'scripts/**/*.mjs', 'tests/**/*.mjs', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  // 桌面版（Electron）的主进程和 preload：CommonJS，跑在 Node 里
  {
    files: ['electron/**/*.cjs'],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
