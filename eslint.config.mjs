import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "data/**", "next-env.d.ts", "coverage/**"] },
  ...tseslint.configs.recommended,
);
