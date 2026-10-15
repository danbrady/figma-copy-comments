// Figma's recommended setup, from the README of @figma/eslint-plugin-figma-plugins.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import * as figmaPlugin from '@figma/eslint-plugin-figma-plugins';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.ui.json'],
      },
    },
    plugins: {
      '@figma/figma-plugins': figmaPlugin,
    },
    rules: {
      ...figmaPlugin.flatConfigs.recommended.rules,
    },
  }
);
