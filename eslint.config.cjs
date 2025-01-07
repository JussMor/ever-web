const eslintPluginAstro = require("eslint-plugin-astro");
module.exports = [
  ...eslintPluginAstro.configs["flat/recommended"], // In CommonJS, the `flat/` prefix is required.
  {
    rules: {
      // override/add rules settings here, such as:
      // "astro/no-set-html-directive": "error"
    },
  },
];
