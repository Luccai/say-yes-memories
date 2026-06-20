import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      ".next/**",
      "out/**",
      "node_modules/**",
      ".local-data/**",
      "private/**",
      "skills/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
