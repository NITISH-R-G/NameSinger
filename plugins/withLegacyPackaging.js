// The song engine is a native executable shipped as a .so and run as a child process from nativeLibraryDir,
// so the APK must extract its native libraries to disk (legacy packaging).
const { withGradleProperties } = require('expo/config-plugins');

module.exports = function withLegacyPackaging(config) {
  return withGradleProperties(config, (c) => {
    c.modResults = c.modResults.filter((i) => !(i.type === 'property' && i.key === 'expo.useLegacyPackaging'));
    c.modResults.push({ type: 'property', key: 'expo.useLegacyPackaging', value: 'true' });
    return c;
  });
};
