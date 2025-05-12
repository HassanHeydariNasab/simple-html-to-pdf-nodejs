export default {
  testEnvironment: "node",
  transform: {},
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.mjs$": "$1.mjs",
  },
  setupFilesAfterEnv: ["./jest.setup.cjs"],
};
