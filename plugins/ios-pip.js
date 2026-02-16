/**
 * Expo config plugin: enable iOS Picture-in-Picture for video conferencing.
 * Adds com.apple.developer.avfoundation.multitasking-camera-access entitlement
 * required for 100ms meeting PiP so the meeting can show in a floating window when the app is in background.
 *
 * IMPORTANT: Before App Store submission, you must request this entitlement from Apple:
 * https://developer.apple.com/contact/request/multitasking-camera-access/
 *
 * @see https://100ms.live/docs/react-native/v2/how-to-guides/set-up-video-conferencing/render-video/pip-mode
 */
const { withEntitlementsPlist } = require('expo/config-plugins');

const ENTITLEMENT_KEY = 'com.apple.developer.avfoundation.multitasking-camera-access';

function withIosPip(config) {
  return withEntitlementsPlist(config, (config) => {
    config.modResults[ENTITLEMENT_KEY] = true;
    return config;
  });
}

module.exports = withIosPip;
