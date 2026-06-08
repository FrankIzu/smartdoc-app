import React from 'react';
import Svg, { Path } from 'react-native-svg';

/** Microsoft four-square mark — official brand colors. */
export function MicrosoftLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill="#F25022" d="M1 1h10v10H1z" />
      <Path fill="#7FBA00" d="M13 1h10v10H13z" />
      <Path fill="#00A4EF" d="M1 13h10v10H1z" />
      <Path fill="#FFB900" d="M13 13h10v10H13z" />
    </Svg>
  );
}
