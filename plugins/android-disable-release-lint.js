/**
 * Expo config plugin: disable lintVitalAnalyzeRelease (and similar) for all Android subprojects.
 * Prevents Metaspace OOM in CI (Expo/RN + 100ms + many modules). Safe to run every prebuild (idempotent).
 */
const { withDangerousMod } = require('expo/config-plugins');
const path = require('path');
const fs = require('fs');

const MARKER = 'lintVital disabled whenReady';

function withAndroidDisableReleaseLint(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const buildGradlePath = path.join(config.modRequest.platformProjectRoot, 'build.gradle');
      let content = await fs.promises.readFile(buildGradlePath, 'utf8');
      if (content.includes(MARKER)) return config;

      const block = `
// ${MARKER}
gradle.taskGraph.whenReady { graph ->
  graph.allTasks.each { task ->
    if (task.name.contains("lintVital") || task.name.contains("lintRelease")) {
      task.enabled = false
    }
  }
}
`;
      await fs.promises.appendFile(buildGradlePath, block);
      return config;
    },
  ]);
}

module.exports = withAndroidDisableReleaseLint;
