/**
 * Babel config for the Expo app.
 *
 * CommonJS on purpose: Metro loads the Babel config **synchronously**, and Babel only supports
 * ESM config files asynchronously. That is why this package alone declares
 * `"type": "commonjs"` instead of the monorepo's usual `"type": "module"` — see README.md.
 */
module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
