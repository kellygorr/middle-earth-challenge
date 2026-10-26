// Pin the timezone so DST-sensitive date tests are deterministic across
// machines and CI. Must run before the test environment boots, which is why
// this is globalSetup rather than jest.setup.js.
module.exports = async () => {
  process.env.TZ = 'America/Los_Angeles';
};
