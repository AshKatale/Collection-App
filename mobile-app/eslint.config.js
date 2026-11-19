// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    rules: {
      // Loading data / resetting a form when a sheet opens is exactly what these effects do
      'react-hooks/set-state-in-effect': 'off',
      'import/no-named-as-default-member': 'off',
    },
  },
]);
