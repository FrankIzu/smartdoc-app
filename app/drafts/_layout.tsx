import React from 'react';
import { DraftsSplitProvider } from '../../contexts/DraftsSplitContext';
import DraftsSplitLayout from '../../components/drafts/DraftsSplitLayout';

export default function DraftsLayout() {
  return (
    <DraftsSplitProvider>
      <DraftsSplitLayout />
    </DraftsSplitProvider>
  );
}
