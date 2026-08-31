import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import DraftsEmptyDetail from '../../components/drafts/DraftsEmptyDetail';
import DraftsListPane from '../../components/drafts/DraftsListPane';
import { useDraftsSplitOptional } from '../../contexts/DraftsSplitContext';
import { useThemeColors } from '../../hooks/useThemeColors';

export default function DraftsListScreen() {
  const split = useDraftsSplitOptional();
  const colors = useThemeColors();

  if (split?.isSplit) {
    return <DraftsEmptyDetail />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.headerBackground }} edges={['top']}>
      <DraftsListPane mode="phone" />
    </SafeAreaView>
  );
}
