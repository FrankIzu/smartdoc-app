import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import type { WizardField } from '../../../types/signature';
import FillCompositePage from './FillCompositePage';

export interface FillCaptureHostHandle {
  captureAllPages: () => Promise<string[]>;
}

interface PageDimensions {
  w: number;
  h: number;
}

interface Props {
  pageImages: string[];
  pageDimensions: Record<number, PageDimensions | undefined>;
  fields: WizardField[];
  fieldValues: Record<string, unknown>;
}

async function measureImage(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      url,
      (w, h) => resolve({ w, h }),
      (err) => reject(err ?? new Error('Could not measure page image')),
    );
  });
}

const FillCaptureHost = forwardRef<FillCaptureHostHandle, Props>(function FillCaptureHost(
  { pageImages, pageDimensions, fields, fieldValues },
  ref,
) {
  const pageRef = useRef<View>(null);
  const [capturePageIndex, setCapturePageIndex] = useState<number | null>(null);
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null);

  const captureAllPages = useCallback(async (): Promise<string[]> => {
    const results: string[] = [];
    for (let index = 0; index < pageImages.length; index++) {
      const url = pageImages[index];
      if (!url) {
        results.push('');
        continue;
      }

      let w = pageDimensions[index]?.w ?? 0;
      let h = pageDimensions[index]?.h ?? 0;
      if (w <= 0 || h <= 0) {
        const measured = await measureImage(url);
        w = measured.w;
        h = measured.h;
      }

      setPageSize({ w, h });
      setCapturePageIndex(index);

      await new Promise((r) => setTimeout(r, 120));

      if (!pageRef.current) {
        throw new Error('Page capture failed');
      }

      const tmpUri = await captureRef(pageRef, {
        format: 'jpg',
        quality: 0.9,
        result: 'tmpfile',
      });
      const { readAsStringAsync, EncodingType } = await import('expo-file-system/legacy');
      const b64 = await readAsStringAsync(tmpUri, { encoding: EncodingType.Base64 });
      results.push(`data:image/jpeg;base64,${b64}`);
    }

    setCapturePageIndex(null);
    setPageSize(null);
    return results;
  }, [fields, fieldValues, pageDimensions, pageImages]);

  useImperativeHandle(ref, () => ({ captureAllPages }), [captureAllPages]);

  if (capturePageIndex == null || !pageSize) return null;

  const pageFields = fields.filter((f) => !f.deleted && (f.page ?? 0) === capturePageIndex);

  return (
    <View pointerEvents="none" style={styles.host}>
      <FillCompositePage
        ref={pageRef}
        pageImageUrl={pageImages[capturePageIndex]!}
        pageWidth={pageSize.w}
        pageHeight={pageSize.h}
        fields={pageFields}
        fieldValues={fieldValues}
      />
    </View>
  );
});

export default FillCaptureHost;

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: -10000,
    top: 0,
    opacity: 0,
  },
});
