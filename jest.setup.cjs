const { configureToMatchImageSnapshot } = require("jest-image-snapshot");

const toMatchImageSnapshot = configureToMatchImageSnapshot({
  customDiffConfig: { threshold: 0.1 },
  failureThreshold: 0.01,
  failureThresholdType: "percent",
});

expect.extend({ toMatchImageSnapshot });
