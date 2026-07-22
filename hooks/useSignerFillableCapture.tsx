import React, { useCallback, useRef, useState } from 'react';
import FillCaptureHost, { type FillCaptureHostHandle } from '../components/signatures/fill/FillCaptureHost';
import type { NormalizedSignerSession, RuntimeDocument } from '../types/signature';
import { runtimeFieldsToWizard } from '../utils/signatureRuntime';

interface Options {
  session: NormalizedSignerSession | null;
  fieldValues: Record<string, unknown>;
}

/**
 * Off-screen fillable page capture for envelope submit (doc_pages).
 * Uses the same FillCompositePage path as standalone fill mode.
 */
export function useSignerFillableCapture({ session, fieldValues }: Options) {
  const captureHostRef = useRef<FillCaptureHostHandle>(null);
  const fieldValuesRef = useRef(fieldValues);
  fieldValuesRef.current = fieldValues;

  const [captureDoc, setCaptureDoc] = useState<RuntimeDocument | null>(null);

  const compositeDocument = useCallback(async (docKey: string): Promise<string[] | null> => {
    const doc = session?.documents.find((d) => d.documentKey === docKey && d.sourceType === 'fillable');
    if (!doc || doc.pages.length === 0) return null;
    setCaptureDoc(doc);
    await new Promise((r) => setTimeout(r, 180));
    try {
      const pages = await captureHostRef.current?.captureAllPages();
      return pages?.length ? pages : null;
    } finally {
      setCaptureDoc(null);
    }
  }, [session]);

  const captureHost =
    captureDoc && captureDoc.pages.length > 0 ? (
      <FillCaptureHost
        ref={captureHostRef}
        pageImages={captureDoc.pages.map((p) => p.imageUrl)}
        pageDimensions={{}}
        fields={runtimeFieldsToWizard(captureDoc.fields)}
        fieldValues={fieldValuesRef.current}
      />
    ) : null;

  return { compositeDocument, captureHost };
}
