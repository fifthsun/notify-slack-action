import js from "@eslint/js"
import github from "eslint-plugin-github"
import globals from "globals"
import tseslint from "typescript-eslint"

export default tseslint.config(
  { ignores: ["dist/", "lib/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  github.getFlatConfigs().recommended,
  ...github.getFlatConfigs().typescript,
  {
    rules: { "import/no-unresolved": "off" },
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true },
    },
    rules: {
      camelcase: "off",
      "object-shorthand": "off",
      "i18n-text/no-en": "off",
      "filenames/match-regex": "off",
    },
  }
)
