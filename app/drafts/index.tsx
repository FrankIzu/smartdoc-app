import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import DraftsEmptyDetail from '../../components/drafts/DraftsEmptyDetail';
import DraftsListPane from '../../components/drafts/DraftsListPane';
import { useDraftsSplitOptional } from '../../contexts/DraftsSplitContext';

export default function DraftsListScreen() {
  const split = useDraftsSplitOptional();

  if (split?.isSplit) {
    return <DraftsEmptyDetail />;
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <DraftsListPane mode="phone" />
    </SafeAreaView>
  );
}
