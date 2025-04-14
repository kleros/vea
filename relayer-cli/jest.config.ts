import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  collectCoverage: true,
  collectCoverageFrom: ["**/*.ts"],
  moduleNameMapper: {
    "^consts/(.*)$": "<rootDir>/src/consts/$1",
  },
};

export default config;
