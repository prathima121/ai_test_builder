import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#10131a",
        ocean: "#1f6feb",
        mint: "#22c55e",
        sand: "#f5efe6"
      }
    }
  },
  plugins: []
};

export default config;
