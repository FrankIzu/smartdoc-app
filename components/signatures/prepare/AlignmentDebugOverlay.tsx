/**
 * Renders colored debug outlines for field rects (prepare / fill / composite QA).
 * Only rendered when isDebugAlignmentEnabled() is true.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { AlignmentOverlay } from '../../../utils/fillable';

interface Props {
  overlays: AlignmentOverlay[];
}

export default function AlignmentDebugOverlay({ overlays }: Props) {
  if (!overlays.length) return null;

  return (
    <>
      {overlays.map((o) => (
        <View
          key={`${o.source}-${o.fieldId}`}
          pointerEvents="none"
          style={[
            styles.outline,
            {
              left: o.pixelRect.left,
              top: o.pixelRect.top,
              width: o.pixelRect.width,
              height: o.pixelRect.height,
              borderColor: o.color,
            },
          ]}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  outline: {
    position: 'absolute',
    borderWidth: 2,
    backgroundColor: 'transparent',
    zIndex: 9999,
  },
});
