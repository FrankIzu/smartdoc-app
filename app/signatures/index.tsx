import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DocumentViewer from '../../components/DocumentViewer';
import EnvelopeListItem from '../../components/signatures/EnvelopeListItem';
import SignatureActivityListItem from '../../components/signatures/SignatureActivityListItem';
import SignatureCreateChooser from '../../components/signatures/SignatureCreateChooser';
import { useEnvelopeList, ENVELOPE_LIST_PAGE_SIZE } from '../../hooks/useEnvelopeList';
import { invalidateSignatureActivityCache, useSignatureAllList } from '../../hooks/useSignatureAllList';
import type { SignatureActivityItem } from '../../hooks/useSignatureAllList';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { EnvelopeTab } from '../../services/envelopeApi';
import { deleteFillableTemplate } from '../../services/fillableApi';
import type { Envelope } from '../../types/signature';
import { submissionDisplayTitle } from '../../utils/signatureActivity';
import { envelopeDisplayId } from '../../utils/signatureRuntime';
import { shareDocumentFile } from '../../utils/shareDocumentFile';
import {
  hubDetailRoute,
  hubFillEditorRoute,
  hubFillRoute,
  hubPrepareRoute,
  hubSignRoute,
  hubTemplateSubmissionsRoute,
} from '../../utils/signatureRouteResolver';

const TABS: { key: EnvelopeTab; label?: string; icon?: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all', icon: 'home' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'sent', label: 'Sent' },
  { key: 'completed', label: 'Completed' },
  { key: 'drafts', label: 'Drafts' },
];

function templateDisplayId(template: { public_id?: string; id: number }): string {
  return template.public_id ?? String(template.id);
}

export default function SignaturesHubScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const colors = useThemeColors();
  const validTab = (t?: string): EnvelopeTab =>
    TABS.some((x) => x.key === t) ? (t as EnvelopeTab) : 'all';
  const [tab, setTab] = useState<EnvelopeTab>(() => validTab(params.tab));
  const [chooserOpen, setChooserOpen] = useState(false);
  const [viewerFile, setViewerFile] = useState<{ id: string; name: string } | null>(null);
  const [allVisibleCount, setAllVisibleCount] = useState(ENVELOPE_LIST_PAGE_SIZE);
  const isAllTab = tab === 'all';
  const { envelopes, loading, loadingMore, refreshing, hasMore, loadMore, refresh, revalidateIfStale } =
    useEnvelopeList(tab);
  const {
    items: allItems,
    loading: activityLoading,
    revalidateIfStale: revalidateActivityIfStale,
    refreshAll: refreshActivity,
  } = useSignatureAllList(isAllTab, envelopes);
  const lastFocusRefresh = useRef(0);

  useEffect(() => {
    if (isAllTab) {
      setAllVisibleCount(ENVELOPE_LIST_PAGE_SIZE);
    }
  }, [isAllTab, tab]);

  useEffect(() => {
    if (params.tab) {
      setTab(validTab(params.tab));
    }
  }, [params.tab]);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastFocusRefresh.current > 1500) {
        lastFocusRefresh.current = now;
        void revalidateIfStale();
        if (isAllTab) {
          void revalidateActivityIfStale();
        }
      }
    }, [isAllTab, revalidateActivityIfStale, revalidateIfStale]),
  );

  const handleRefresh = useCallback(async () => {
    if (isAllTab) {
      setAllVisibleCount(ENVELOPE_LIST_PAGE_SIZE);
      invalidateSignatureActivityCache();
    }
    await refresh();
    if (isAllTab) {
      await refreshActivity();
    }
  }, [isAllTab, refresh, refreshActivity]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 14,
          paddingVertical: 12,
        },
        title: { fontSize: 22, fontWeight: '700', color: colors.text },
        tabsScroll: { marginBottom: 8, maxHeight: 44 },
        tabs: { flexDirection: 'row', paddingHorizontal: 10, alignItems: 'center' },
        tab: { paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 4, borderRadius: 20 },
        tabIcon: { paddingHorizontal: 10, paddingVertical: 8, marginHorizontal: 4, borderRadius: 20 },
        tabActive: { backgroundColor: colors.primary },
        tabText: { fontSize: 13, fontWeight: '600' },
        empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
        fab: {
          position: 'absolute',
          right: 20,
          bottom: 24,
          backgroundColor: colors.primary,
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          elevation: 4,
        },
        footer: { paddingVertical: 16 },
      }),
    [colors],
  );

  const visibleAllItems = useMemo(
    () => (isAllTab ? allItems.slice(0, allVisibleCount) : allItems),
    [allItems, allVisibleCount, isAllTab],
  );
  const allHasMoreLocal = isAllTab && allVisibleCount < allItems.length;

  const showInitialSpinner =
    isAllTab
      ? (loading || activityLoading) && allItems.length === 0 && !refreshing
      : loading && envelopes.length === 0 && !refreshing;

  const handleLoadMore = useCallback(() => {
    if (isAllTab) {
      if (allHasMoreLocal) {
        setAllVisibleCount((count) => count + ENVELOPE_LIST_PAGE_SIZE);
        return;
      }
      if (hasMore && !loadingMore && !loading) {
        void loadMore();
      }
      return;
    }
    if (hasMore && !loadingMore && !loading) {
      void loadMore();
    }
  }, [allHasMoreLocal, hasMore, isAllTab, loadMore, loading, loadingMore]);

  const handleShareFile = useCallback(
    async (fileId: number | string | null | undefined, name: string) => {
      if (fileId == null) {
        Alert.alert('Cannot share', 'No file is available to share yet.');
        return;
      }
      try {
        await shareDocumentFile(fileId, name);
      } catch (e: unknown) {
        Alert.alert('Could not share', e instanceof Error ? e.message : 'Try again.');
      }
    },
    [],
  );

  const renderActivityRow = useCallback(
    (row: SignatureActivityItem) => {
      const templateId = row.template
        ? templateDisplayId(row.template)
        : row.submission
          ? String(row.submission.template_id)
          : null;
      return (
        <SignatureActivityListItem
          item={row}
          onPress={() => {
            if (row.kind === 'envelope' && row.envelope) {
              router.push(hubDetailRoute(envelopeDisplayId(row.envelope)));
            }
          }}
          onSign={
            row.envelope?.inbox_context?.can_sign
              ? () => {
                  const env = row.envelope;
                  if (env) router.push(hubSignRoute(envelopeDisplayId(env)));
                }
              : undefined
          }
          onViewDocument={
            row.kind === 'fillable' && row.template?.file_id
              ? () => {
                  setViewerFile({
                    id: String(row.template!.file_id),
                    name: row.template!.name || 'Document',
                  });
                }
              : undefined
          }
          onFillDocument={
            row.kind === 'fillable' && templateId
              ? () => router.push(hubFillEditorRoute(templateId))
              : undefined
          }
          onViewSubmission={
            row.kind === 'submission' && row.submission?.filled_file_id
              ? () => {
                  setViewerFile({
                    id: String(row.submission!.filled_file_id),
                    name: submissionDisplayTitle(row.submission!),
                  });
                }
              : undefined
          }
          onViewSubmissions={
            row.kind === 'submission' && templateId
              ? () => router.push(hubTemplateSubmissionsRoute(templateId))
              : undefined
          }
          onShare={
            row.kind === 'fillable' && row.template?.file_id
              ? () => {
                  void handleShareFile(row.template!.file_id, row.template!.name || 'Document');
                }
              : row.kind === 'submission' && row.submission?.filled_file_id
                ? () => {
                    void handleShareFile(
                      row.submission!.filled_file_id,
                      submissionDisplayTitle(row.submission!),
                    );
                  }
                : undefined
          }
          onDeleteDocument={
            row.kind === 'fillable' && row.template
              ? () => {
                  const tpl = row.template!;
                  const label = tpl.name || 'this document';
                  Alert.alert(
                    'Delete document?',
                    `"${label}" will be moved to Trash.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => {
                          void (async () => {
                            try {
                              await deleteFillableTemplate(templateDisplayId(tpl));
                              invalidateSignatureActivityCache();
                              await refreshActivity();
                            } catch (e: unknown) {
                              Alert.alert(
                                'Could not delete',
                                e instanceof Error ? e.message : 'Try again.',
                              );
                            }
                          })();
                        },
                      },
                    ],
                  );
                }
              : undefined
          }
        />
      );
    },
    [handleShareFile, refreshActivity, router],
  );

  const listFooter = loadingMore ? (
    <View style={styles.footer}>
      <ActivityIndicator color={colors.primary} />
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Signatures</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabs}
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[t.icon ? styles.tabIcon : styles.tab, active && styles.tabActive]}
              onPress={() => setTab(t.key)}
              accessibilityLabel={t.label ?? 'Home'}
            >
              {t.icon ? (
                <Ionicons
                  name={
                    (active ? t.icon : `${t.icon}-outline`) as React.ComponentProps<
                      typeof Ionicons
                    >['name']
                  }
                  size={18}
                  color={active ? '#fff' : colors.textSecondary}
                />
              ) : (
                <Text style={[styles.tabText, { color: active ? '#fff' : colors.textSecondary }]}>
                  {t.label}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {showInitialSpinner ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : isAllTab ? (
        <FlatList<SignatureActivityItem>
          data={visibleAllItems}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ color: colors.textSecondary }}>No documents yet</Text>
            </View>
          }
          ListFooterComponent={listFooter}
          renderItem={({ item }) => renderActivityRow(item)}
          contentContainerStyle={
            visibleAllItems.length === 0
              ? { flexGrow: 1, paddingBottom: 100 }
              : { paddingBottom: 100, paddingTop: 4 }
          }
        />
      ) : (
        <FlatList<Envelope>
          data={envelopes}
          keyExtractor={(item) => envelopeDisplayId(item)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ color: colors.textSecondary }}>No envelopes</Text>
            </View>
          }
          ListFooterComponent={listFooter}
          renderItem={({ item }) => (
            <EnvelopeListItem
              envelope={item}
              tab={tab}
              onPress={() => router.push(hubDetailRoute(envelopeDisplayId(item)))}
              onSign={
                item.inbox_context?.can_sign
                  ? () => router.push(hubSignRoute(envelopeDisplayId(item)))
                  : undefined
              }
            />
          )}
          contentContainerStyle={
            envelopes.length === 0
              ? { flexGrow: 1, paddingBottom: 100 }
              : { paddingBottom: 100, paddingTop: 4 }
          }
        />
      )}
      <TouchableOpacity style={styles.fab} onPress={() => setChooserOpen(true)}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <SignatureCreateChooser
        visible={chooserOpen}
        onClose={() => setChooserOpen(false)}
        onPrepare={() => router.push(hubPrepareRoute())}
        onFill={() => router.push(hubFillRoute())}
      />

      {viewerFile ? (
        <DocumentViewer
          fileId={viewerFile.id}
          fileName={viewerFile.name}
          fileType="application/pdf"
          onClose={() => setViewerFile(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}
