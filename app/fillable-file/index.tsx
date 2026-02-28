/**
 * Fillable File: templates list, upload, fill link, send, view completed, upload codes.
 * Uses web endpoints; workspace_id from params when in workspace context.
 */
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiService } from '../../services/api';
import { useAuth } from '../context/auth';

type SubTab = 'all' | 'templates' | 'completed' | 'deleted';

interface FillableTemplate {
  id: number;
  file_id: number;
  name: string;
  description?: string;
  original_filename?: string;
  created_at?: string;
  deleted_at?: string | null;
}

interface FillSubmission {
  id: number;
  template_id: number;
  filled_file_id?: number;
  filled_by_name?: string;
  filled_by_email?: string;
  filled_by_user_id?: number | null;
  filled_at: string;
  source_type: string;
  status: string;
}

interface FillLinkRow {
  id: number;
  token: string;
  link_type: string;
  expires_at: string | null;
  fill_url: string;
  is_expired: boolean;
}

interface UploadLinkRow {
  id: number;
  upload_code: string;
  link_token: string;
  upload_url: string;
}

const TABS: { key: SubTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'templates', label: 'Templates' },
  { key: 'completed', label: 'Completed' },
  { key: 'deleted', label: 'Deleted' },
];

function fmtUtc(iso: string | null | undefined): string {
  if (!iso) return '';
  const s = /[Z+\-]\d*$/.test(iso) ? iso : iso + 'Z';
  const d = new Date(s);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function FillableFileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const colors = useThemeColors();
  const workspaceId = params.workspaceId != null ? Number(params.workspaceId) : undefined;

  const [templates, setTemplates] = useState<FillableTemplate[]>([]);
  const [deletedTemplates, setDeletedTemplates] = useState<FillableTemplate[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<FillSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [subTab, setSubTab] = useState<SubTab>('templates');
  const [deletedLoading, setDeletedLoading] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showNameModal, setShowNameModal] = useState(false);
  const [pendingFileId, setPendingFileId] = useState<number | null>(null);
  const [pendingFileName, setPendingFileName] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const uploadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showSendModal, setShowSendModal] = useState(false);
  const [sendTemplate, setSendTemplate] = useState<FillableTemplate | null>(null);
  const [sendLinkType, setSendLinkType] = useState<'view' | 'edit'>('edit');
  const [sendExpiresInDays, setSendExpiresInDays] = useState<number | null>(30);
  const [createdFillUrl, setCreatedFillUrl] = useState('');
  const [fillLinks, setFillLinks] = useState<FillLinkRow[]>([]);
  const [fillLinksLoading, setFillLinksLoading] = useState(false);

  const [showViewCompleted, setShowViewCompleted] = useState(false);
  const [viewCompletedTemplate, setViewCompletedTemplate] = useState<FillableTemplate | null>(null);
  const [submissionsForTemplate, setSubmissionsForTemplate] = useState<FillSubmission[]>([]);

  const [showUploadCodeModal, setShowUploadCodeModal] = useState(false);
  const [uploadCodeTemplate, setUploadCodeTemplate] = useState<FillableTemplate | null>(null);
  const [uploadLinksList, setUploadLinksList] = useState<UploadLinkRow[]>([]);
  const [uploadLinksLoading, setUploadLinksLoading] = useState(false);
  const [addingUploadCode, setAddingUploadCode] = useState(false);

  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<FillableTemplate | null>(null);
  const [showSubmissionMenu, setShowSubmissionMenu] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<FillSubmission | null>(null);
  const [submissionMenuInViewCompleted, setSubmissionMenuInViewCompleted] = useState(false);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await apiService.getFillableTemplates(workspaceId ?? null);
      if (res.success && Array.isArray(res.templates)) setTemplates(res.templates);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to load templates');
    }
  }, [workspaceId]);

  const loadAllSubmissions = useCallback(async () => {
    try {
      const res = await apiService.getAllFillableSubmissions(workspaceId ?? null);
      if (res.success && Array.isArray(res.submissions)) setAllSubmissions(res.submissions);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to load submissions');
    }
  }, [workspaceId]);

  const loadDeleted = useCallback(async () => {
    setDeletedLoading(true);
    try {
      const res = await apiService.getFillableTemplatesDeleted(workspaceId ?? null);
      if (res.success && Array.isArray(res.templates)) setDeletedTemplates(res.templates);
      else setDeletedTemplates([]);
    } catch {
      setDeletedTemplates([]);
    } finally {
      setDeletedLoading(false);
    }
  }, [workspaceId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadTemplates(), loadAllSubmissions()]);
    setLoading(false);
    setRefreshing(false);
  }, [loadTemplates, loadAllSubmissions]);

  useEffect(() => {
    if (user) loadData();
    else setLoading(false);
  }, [user, loadData]);

  useEffect(() => {
    if (subTab === 'deleted') loadDeleted();
  }, [subTab, loadDeleted]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (uploadTimeoutRef.current) {
        clearTimeout(uploadTimeoutRef.current);
        uploadTimeoutRef.current = null;
      }
    };
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
    if (subTab === 'deleted') loadDeleted();
  };

  const handleUploadPress = async () => {
    if (uploading || !user) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const formData = new FormData();
      formData.append('files', { uri: asset.uri, name: asset.name || 'document', type: asset.mimeType || 'application/octet-stream' } as any);
      formData.append('for_fillable_template', '1');
      setUploading(true);
      setUploadProgress(0);
      const { task_id } = await apiService.uploadFillableTemplateFile(formData);
      const poll = async () => {
        try {
          const prog = await apiService.getWebUploadProgress(task_id);
          const d = prog as any;
          if (d.status === 'completed' && d.files?.length) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            const first = d.files[0];
            const fileId = first.id ?? first.file_id;
            if (fileId) {
              setPendingFileId(fileId);
              setPendingFileName(asset.name || 'Document');
              setTemplateName((asset.name || '').replace(/\.[^/.]+$/, '') || 'Untitled template');
              setTemplateDescription('');
              setShowNameModal(true);
            } else Alert.alert('Error', 'Could not get file ID from upload');
            setUploading(false);
            return;
          }
          if (d.status === 'error') {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            Alert.alert('Error', d.message || 'Upload failed');
            setUploading(false);
          }
        } catch (_) {}
      };
      poll();
      pollIntervalRef.current = setInterval(poll, 2000);
      uploadTimeoutRef.current = setTimeout(() => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setUploading(false);
        Alert.alert('Error', 'Upload timed out');
      }, 120000);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Upload failed');
      setUploading(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (pendingFileId == null) return;
    try {
      const res = await apiService.createFillableTemplate({
        file_id: pendingFileId,
        name: templateName.trim() || 'Untitled template',
        description: templateDescription.trim() || undefined,
      });
      if (res.success) {
        setShowNameModal(false);
        setPendingFileId(null);
        setPendingFileName('');
        loadTemplates();
        loadAllSubmissions();
      } else Alert.alert('Error', (res as any).message || 'Failed to create template');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to create template');
    }
  };

  const handleFill = async (t: FillableTemplate) => {
    try {
      const res = await apiService.createFillLink(t.id, { link_type: 'edit' }) as any;
      if (res?.success && res?.fill_url) {
        router.push({ pathname: '/fillable-file/fill', params: { url: encodeURIComponent(res.fill_url) } });
      } else Alert.alert('Error', res?.message || 'Could not create fill link');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not open fill');
    }
  };

  const loadFillLinks = async (templateId: number) => {
    setFillLinksLoading(true);
    try {
      const res = await apiService.getFillLinks(templateId) as any;
      if (res?.success && Array.isArray(res.links)) setFillLinks(res.links);
      else setFillLinks([]);
    } catch {
      setFillLinks([]);
    } finally {
      setFillLinksLoading(false);
    }
  };

  const handleSendClick = (t: FillableTemplate) => {
    setSendTemplate(t);
    setSendLinkType('edit');
    setSendExpiresInDays(30);
    setCreatedFillUrl('');
    setFillLinks([]);
    setShowSendModal(true);
    loadFillLinks(t.id);
  };

  const handleCreateSendLink = async () => {
    if (!sendTemplate) return;
    try {
      const res = await apiService.createFillLink(sendTemplate.id, {
        link_type: sendLinkType,
        expires_in_days: sendExpiresInDays ?? undefined,
        notify_on_submit: true,
      }) as any;
      if (res?.success && res?.fill_url) {
        setCreatedFillUrl(res.fill_url);
        loadFillLinks(sendTemplate.id);
      } else Alert.alert('Error', res?.message || 'Could not create link');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not create link');
    }
  };

  const handleShareFillLink = () => {
    if (!createdFillUrl) return;
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      Share.share({ message: createdFillUrl, url: createdFillUrl, title: 'Fill document link' }).catch(() => {});
    } else {
      Clipboard.setString(createdFillUrl);
      Alert.alert('Copied', 'Link copied to clipboard');
    }
  };

  const handleCopyFillUrl = () => {
    if (createdFillUrl) {
      Clipboard.setString(createdFillUrl);
      Alert.alert('Copied', 'Link copied to clipboard');
    }
  };

  const handleViewCompletedClick = (t: FillableTemplate) => {
    setViewCompletedTemplate(t);
    setShowViewCompleted(true);
    apiService.getFillableSubmissions(t.id).then((res: any) => {
      if (res?.success && Array.isArray(res.submissions)) setSubmissionsForTemplate(res.submissions);
      else setSubmissionsForTemplate([]);
    });
  };

  const loadUploadLinksForTemplate = async (templateId: number) => {
    setUploadLinksLoading(true);
    try {
      const res = await apiService.getFillableUploadLinks(templateId) as any;
      if (res?.success && Array.isArray(res.upload_links)) setUploadLinksList(res.upload_links);
      else setUploadLinksList([]);
    } catch {
      setUploadLinksList([]);
    } finally {
      setUploadLinksLoading(false);
    }
  };

  const handleGetUploadCode = (t: FillableTemplate) => {
    setUploadCodeTemplate(t);
    setUploadLinksList([]);
    setShowUploadCodeModal(true);
    loadUploadLinksForTemplate(t.id);
  };

  const handleAddUploadCode = async () => {
    if (!uploadCodeTemplate) return;
    setAddingUploadCode(true);
    try {
      await apiService.createFillableUploadLink(uploadCodeTemplate.id);
      await loadUploadLinksForTemplate(uploadCodeTemplate.id);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to create upload code');
    } finally {
      setAddingUploadCode(false);
    }
  };

  const handleDeleteFillLink = async (shareId: number) => {
    if (!sendTemplate) return;
    try {
      await apiService.deleteFillLink(shareId);
      setFillLinks(prev => prev.filter(l => l.id !== shareId));
      if (createdFillUrl) setCreatedFillUrl('');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not delete link');
    }
  };

  const handleDeleteTemplate = (t: FillableTemplate) => {
    Alert.alert('Delete template', `Move "${t.name}" to Deleted? You can restore it later.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiService.deleteFillableTemplate(t.id);
            setTemplates(prev => prev.filter(x => x.id !== t.id));
            loadAllSubmissions();
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Failed to delete');
          }
        },
      },
    ]);
  };

  const handleRestoreTemplate = async (t: FillableTemplate) => {
    try {
      const res = await apiService.restoreFillableTemplate(t.id) as any;
      if (res?.success && res?.template) {
        setDeletedTemplates(prev => prev.filter(x => x.id !== t.id));
        setTemplates(prev => [res.template, ...prev]);
        loadAllSubmissions();
      } else Alert.alert('Error', (res as any)?.message || 'Could not restore');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to restore');
    }
  };

  const handleDuplicateTemplate = async (t: FillableTemplate) => {
    try {
      const res = await apiService.duplicateFillableTemplate(t.id) as any;
      if (res?.success && res?.template) {
        setTemplates(prev => [res.template, ...prev]);
        loadAllSubmissions();
      } else Alert.alert('Error', (res as any)?.message || 'Could not duplicate');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to duplicate');
    }
  };

  const getSubmissionTemplateName = (templateId: number) => templates.find(x => x.id === templateId)?.name ?? `Template ${templateId}`;

  const handleSubmissionEdit = async (s: FillSubmission) => {
    try {
      const res = await apiService.getFillableSubmissionEditUrl(s.id) as any;
      if (res?.success && res?.fill_url) {
        router.push({ pathname: '/fillable-file/fill', params: { url: encodeURIComponent(res.fill_url) } });
      } else Alert.alert('Error', (res as any)?.message || 'Could not get edit link');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not open for edit');
    }
  };

  const handleDeleteSubmission = async (s: FillSubmission, fromViewCompletedModal?: boolean) => {
    Alert.alert('Delete submission', 'Delete this completed submission? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiService.deleteFillableSubmission(s.id);
            if (fromViewCompletedModal && viewCompletedTemplate) {
              const res = await apiService.getFillableSubmissions(viewCompletedTemplate.id) as any;
              if (res?.success && Array.isArray(res.submissions)) setSubmissionsForTemplate(res.submissions);
            }
            loadAllSubmissions();
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Failed to delete');
          }
        },
      },
    ]);
  };

  const openFileView = (fileId: number) => {
    Linking.openURL(apiService.getWebFileViewUrl(fileId)).catch(() => {});
  };

  const openFileDownload = (fileId: number) => {
    Linking.openURL(apiService.getWebFileDownloadUrl(fileId)).catch(() => {});
  };

  const activeTemplates = templates.filter(t => !t.deleted_at);

  const MIN_TOUCH = 44;
  const dynamicStyles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
    backBtn: { padding: 10, marginLeft: -6, marginRight: 4, minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, justifyContent: 'center' },
    title: { fontSize: 18, fontWeight: '600', color: colors.text, flex: 1 },
    tabRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 6, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    tab: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, minHeight: MIN_TOUCH, justifyContent: 'center' },
    tabActive: { backgroundColor: colors.primary + '25' },
    tabText: { fontSize: 15, color: colors.textSecondary },
    tabTextActive: { color: colors.primary, fontWeight: '600' },
    content: { flex: 1, padding: 16 },
    uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 20, borderRadius: 12, marginBottom: 20, backgroundColor: colors.primary, minHeight: MIN_TOUCH + 8 },
    uploadBtnDisabled: { opacity: 0.6 },
    uploadBtnText: { color: '#fff', fontSize: 16, fontWeight: '600', marginLeft: 10 },
    card: { backgroundColor: colors.card, borderRadius: 14, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
    cardTitle: { fontSize: 17, fontWeight: '600', color: colors.text, marginBottom: 6 },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
    cardTitleWrap: { flex: 1, marginRight: 8 },
    cardDesc: { fontSize: 14, color: colors.textSecondary, marginBottom: 14, lineHeight: 20 },
    kebabButton: { padding: 8, minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, justifyContent: 'center', alignItems: 'center' },
    kebabMenuContainer: { backgroundColor: colors.card, borderRadius: 12, padding: 8, minWidth: 220, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
    kebabMenuItem: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
    kebabMenuText: { fontSize: 16, color: colors.text },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    actionRowPrimary: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    actionRowSecondary: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    btn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, minHeight: MIN_TOUCH, justifyContent: 'center', alignItems: 'center' },
    btnHalf: { flex: 1, minWidth: '47%' },
    btnFull: { alignSelf: 'stretch' },
    btnGreen: { backgroundColor: '#10B981' },
    btnGray: { backgroundColor: colors.border },
    btnAmber: { backgroundColor: '#F59E0B25' },
    btnRed: { backgroundColor: '#EF444425' },
    btnText: { fontSize: 15, color: colors.text, fontWeight: '500' },
    btnTextWhite: { color: '#fff', fontWeight: '600' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
    modalBox: { backgroundColor: colors.card, borderRadius: 16, padding: 24, maxHeight: '85%' },
    modalTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 20 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 16, color: colors.text, marginBottom: 14 },
    modalRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
    modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minHeight: MIN_TOUCH },
    empty: { padding: 40, alignItems: 'center' },
    emptyText: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
    listHeader: { paddingVertical: 8 },
    submissionRow: { padding: 16, backgroundColor: colors.background, borderRadius: 12, marginBottom: 10 },
    submissionName: { fontSize: 16, fontWeight: '600', color: colors.text },
    submissionMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, fontSize: 13, alignSelf: 'flex-start', marginTop: 6 },
    submissionDate: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    submissionActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  });

  if (!user) {
    return (
      <SafeAreaView style={dynamicStyles.container} edges={['top']}>
        <View style={dynamicStyles.header}>
          <TouchableOpacity style={dynamicStyles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={dynamicStyles.title}>Fillable File</Text>
        </View>
        <View style={dynamicStyles.empty}>
          <Text style={dynamicStyles.emptyText}>Sign in to use Fillable File</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={dynamicStyles.container} edges={['top']}>
      <View style={dynamicStyles.header}>
        <TouchableOpacity style={dynamicStyles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={dynamicStyles.title}>Fillable File</Text>
      </View>

      <View style={dynamicStyles.tabRow}>
        {TABS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[dynamicStyles.tab, subTab === key && dynamicStyles.tabActive]}
            onPress={() => setSubTab(key)}
          >
            <Text style={[dynamicStyles.tabText, subTab === key && dynamicStyles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={dynamicStyles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <TouchableOpacity
          style={[dynamicStyles.uploadBtn, uploading && dynamicStyles.uploadBtnDisabled]}
          onPress={handleUploadPress}
          disabled={uploading}
        >
          <Ionicons name="cloud-upload" size={22} color="#fff" />
          <Text style={dynamicStyles.uploadBtnText}>
            {uploading ? `Uploading… ${uploadProgress}%` : 'Upload Fillable File Template'}
          </Text>
        </TouchableOpacity>

        {(subTab === 'all' || subTab === 'templates') && (
          <>
            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
            ) : activeTemplates.length === 0 ? (
              <View style={dynamicStyles.empty}>
                <Text style={dynamicStyles.emptyText}>No templates yet. Upload a document to create one.</Text>
              </View>
            ) : (
              activeTemplates.map(t => (
                <View key={t.id} style={dynamicStyles.card}>
                  <View style={dynamicStyles.cardHeaderRow}>
                    <View style={dynamicStyles.cardTitleWrap}><Text style={dynamicStyles.cardTitle} numberOfLines={2}>{t.name}</Text></View>
                    <TouchableOpacity
                      style={dynamicStyles.kebabButton}
                      onPress={(e) => { e?.stopPropagation?.(); setSelectedTemplate(t); setShowTemplateMenu(true); }}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="ellipsis-vertical" size={22} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  {t.description ? <Text style={dynamicStyles.cardDesc} numberOfLines={2}>{t.description}</Text> : null}
                </View>
              ))
            )}
          </>
        )}

        {subTab === 'completed' && (
          <>
            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
            ) : allSubmissions.length === 0 ? (
              <View style={dynamicStyles.empty}>
                <Text style={dynamicStyles.emptyText}>No completed submissions yet.</Text>
              </View>
            ) : (
              allSubmissions.map(s => (
                <View key={s.id} style={dynamicStyles.submissionRow}>
                  <View style={dynamicStyles.cardHeaderRow}>
                    <View style={dynamicStyles.cardTitleWrap}>
                      <Text style={dynamicStyles.submissionName}>{getSubmissionTemplateName(s.template_id)}</Text>
                      <Text style={dynamicStyles.submissionMeta}>{fmtUtc(s.filled_at)}</Text>
                      <Text style={dynamicStyles.submissionDate}>
                        {(s.filled_by_name && s.filled_by_name.trim()) || (s.filled_by_email && s.filled_by_email.trim()) || 'Unknown'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={dynamicStyles.kebabButton}
                      onPress={(e) => { e?.stopPropagation?.(); setSelectedSubmission(s); setSubmissionMenuInViewCompleted(false); setShowSubmissionMenu(true); }}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="ellipsis-vertical" size={22} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {subTab === 'deleted' && (
          <>
            {deletedLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
            ) : deletedTemplates.length === 0 ? (
              <View style={dynamicStyles.empty}>
                <Text style={dynamicStyles.emptyText}>No deleted templates.</Text>
              </View>
            ) : (
              deletedTemplates.map(t => (
                <View key={t.id} style={dynamicStyles.card}>
                  <Text style={dynamicStyles.cardTitle} numberOfLines={2}>{t.name}</Text>
                  {t.deleted_at ? <Text style={dynamicStyles.cardDesc}>Deleted {fmtUtc(t.deleted_at)}</Text> : null}
                  <TouchableOpacity style={[dynamicStyles.btn, dynamicStyles.btnGreen, dynamicStyles.btnFull]} onPress={() => handleRestoreTemplate(t)} activeOpacity={0.8}>
                    <Text style={dynamicStyles.btnTextWhite}>Restore</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* Name/description modal after upload */}
      <Modal visible={showNameModal} transparent animationType="fade">
        <View style={dynamicStyles.modalOverlay}>
          <View style={dynamicStyles.modalBox}>
            <Text style={dynamicStyles.modalTitle}>Name your template</Text>
            <TextInput
              style={dynamicStyles.input}
              placeholder="Template name"
              placeholderTextColor={colors.textSecondary}
              value={templateName}
              onChangeText={setTemplateName}
            />
            <TextInput
              style={dynamicStyles.input}
              placeholder="Description (optional)"
              placeholderTextColor={colors.textSecondary}
              value={templateDescription}
              onChangeText={setTemplateDescription}
            />
            <View style={dynamicStyles.modalRow}>
              <TouchableOpacity style={[dynamicStyles.modalBtn, { backgroundColor: colors.border }]} onPress={() => { setShowNameModal(false); setPendingFileId(null); }}>
                <Text style={dynamicStyles.btnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[dynamicStyles.modalBtn, { backgroundColor: colors.primary }]} onPress={handleCreateTemplate}>
                <Text style={dynamicStyles.btnTextWhite}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Template kebab menu */}
      <Modal visible={showTemplateMenu} transparent animationType="fade">
        <TouchableOpacity
          style={dynamicStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => { setShowTemplateMenu(false); setSelectedTemplate(null); }}
        >
          <View style={{ alignSelf: 'center' }} onStartShouldSetResponder={() => true}>
            <View style={dynamicStyles.kebabMenuContainer}>
            {selectedTemplate && (
              <>
                <TouchableOpacity
                  style={dynamicStyles.kebabMenuItem}
                  onPress={() => { setShowTemplateMenu(false); handleFill(selectedTemplate); setSelectedTemplate(null); }}
                >
                  <Ionicons name="create-outline" size={20} color="#10B981" />
                  <Text style={dynamicStyles.kebabMenuText}>Fill</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={dynamicStyles.kebabMenuItem}
                  onPress={() => { setShowTemplateMenu(false); handleSendClick(selectedTemplate); setSelectedTemplate(null); }}
                >
                  <Ionicons name="share-outline" size={20} color={colors.text} />
                  <Text style={dynamicStyles.kebabMenuText}>Send</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={dynamicStyles.kebabMenuItem}
                  onPress={() => { setShowTemplateMenu(false); handleViewCompletedClick(selectedTemplate); setSelectedTemplate(null); }}
                >
                  <Ionicons name="list-outline" size={20} color={colors.text} />
                  <Text style={dynamicStyles.kebabMenuText}>View completed</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={dynamicStyles.kebabMenuItem}
                  onPress={() => { setShowTemplateMenu(false); handleGetUploadCode(selectedTemplate); setSelectedTemplate(null); }}
                >
                  <Ionicons name="code-working-outline" size={20} color="#F59E0B" />
                  <Text style={dynamicStyles.kebabMenuText}>File Request Code</Text>
                </TouchableOpacity>
                {selectedTemplate.file_id ? (
                  <TouchableOpacity
                    style={dynamicStyles.kebabMenuItem}
                    onPress={() => { setShowTemplateMenu(false); openFileDownload(selectedTemplate.file_id!); setSelectedTemplate(null); }}
                  >
                    <Ionicons name="download-outline" size={20} color={colors.text} />
                    <Text style={dynamicStyles.kebabMenuText}>Download original</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={dynamicStyles.kebabMenuItem}
                  onPress={() => { setShowTemplateMenu(false); handleDuplicateTemplate(selectedTemplate); setSelectedTemplate(null); }}
                >
                  <Ionicons name="copy-outline" size={20} color={colors.text} />
                  <Text style={dynamicStyles.kebabMenuText}>Duplicate</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={dynamicStyles.kebabMenuItem}
                  onPress={() => { setShowTemplateMenu(false); handleDeleteTemplate(selectedTemplate); setSelectedTemplate(null); }}
                >
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  <Text style={[dynamicStyles.kebabMenuText, { color: '#EF4444' }]}>Delete</Text>
                </TouchableOpacity>
              </>
            )}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Submission kebab menu */}
      <Modal visible={showSubmissionMenu} transparent animationType="fade">
        <TouchableOpacity
          style={dynamicStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => { setShowSubmissionMenu(false); setSelectedSubmission(null); }}
        >
          <View style={{ alignSelf: 'center' }} onStartShouldSetResponder={() => true}>
            <View style={dynamicStyles.kebabMenuContainer}>
            {selectedSubmission && (
              <>
                {selectedSubmission.filled_file_id ? (
                  <>
                    <TouchableOpacity
                      style={dynamicStyles.kebabMenuItem}
                      onPress={() => { setShowSubmissionMenu(false); openFileView(selectedSubmission.filled_file_id!); setSelectedSubmission(null); }}
                    >
                      <Ionicons name="eye-outline" size={20} color={colors.text} />
                      <Text style={dynamicStyles.kebabMenuText}>View</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={dynamicStyles.kebabMenuItem}
                      onPress={() => { setShowSubmissionMenu(false); openFileDownload(selectedSubmission.filled_file_id!); setSelectedSubmission(null); }}
                    >
                      <Ionicons name="download-outline" size={20} color={colors.text} />
                      <Text style={dynamicStyles.kebabMenuText}>Download</Text>
                    </TouchableOpacity>
                  </>
                ) : null}
                <TouchableOpacity
                  style={dynamicStyles.kebabMenuItem}
                  onPress={() => { setShowSubmissionMenu(false); handleSubmissionEdit(selectedSubmission); setSelectedSubmission(null); }}
                >
                  <Ionicons name="create-outline" size={20} color="#10B981" />
                  <Text style={dynamicStyles.kebabMenuText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={dynamicStyles.kebabMenuItem}
                  onPress={() => { setShowSubmissionMenu(false); handleDeleteSubmission(selectedSubmission, submissionMenuInViewCompleted); setSelectedSubmission(null); }}
                >
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  <Text style={[dynamicStyles.kebabMenuText, { color: '#EF4444' }]}>Delete</Text>
                </TouchableOpacity>
              </>
            )}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Send modal */}
      <Modal visible={showSendModal} transparent animationType="fade">
        <View style={dynamicStyles.modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} showsVerticalScrollIndicator={false}>
            <View style={dynamicStyles.modalBox}>
              <Text style={dynamicStyles.modalTitle} numberOfLines={2}>Send fill link — {sendTemplate?.name}</Text>
              <View style={[dynamicStyles.actionRowPrimary, { marginBottom: 14 }]}>
                <TouchableOpacity style={[dynamicStyles.btn, dynamicStyles.btnHalf, sendLinkType === 'edit' ? dynamicStyles.btnGreen : dynamicStyles.btnGray]} onPress={() => setSendLinkType('edit')} activeOpacity={0.8}>
                  <Text style={[dynamicStyles.btnText, sendLinkType === 'edit' && dynamicStyles.btnTextWhite]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[dynamicStyles.btn, dynamicStyles.btnHalf, sendLinkType === 'view' ? dynamicStyles.btnGreen : dynamicStyles.btnGray]} onPress={() => setSendLinkType('view')} activeOpacity={0.8}>
                  <Text style={[dynamicStyles.btnText, sendLinkType === 'view' && dynamicStyles.btnTextWhite]}>View only</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={[dynamicStyles.btn, dynamicStyles.btnGray, dynamicStyles.btnFull, { marginBottom: 10 }]} onPress={handleCreateSendLink} activeOpacity={0.8}>
                <Text style={dynamicStyles.btnText}>Create link ({sendLinkType})</Text>
              </TouchableOpacity>
              {createdFillUrl ? (
                <View style={dynamicStyles.actionRowPrimary}>
                  <TouchableOpacity style={[dynamicStyles.btn, dynamicStyles.btnGreen, dynamicStyles.btnHalf]} onPress={handleCopyFillUrl} activeOpacity={0.8}>
                    <Text style={dynamicStyles.btnTextWhite}>Copy link</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[dynamicStyles.btn, dynamicStyles.btnGreen, dynamicStyles.btnHalf]} onPress={handleShareFillLink} activeOpacity={0.8}>
                    <Text style={dynamicStyles.btnTextWhite}>Share</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <TouchableOpacity style={[dynamicStyles.modalBtn, { backgroundColor: colors.border, marginTop: 20 }]} onPress={() => { setShowSendModal(false); setSendTemplate(null); setCreatedFillUrl(''); }} activeOpacity={0.8}>
                <Text style={dynamicStyles.btnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* View completed modal */}
      <Modal visible={showViewCompleted} transparent animationType="slide">
        <View style={[dynamicStyles.modalOverlay, { justifyContent: 'flex-end' }]}>
          <View style={[dynamicStyles.modalBox, { maxHeight: '75%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={[dynamicStyles.modalTitle, { flex: 1 }]} numberOfLines={2}>Completed — {viewCompletedTemplate?.name}</Text>
              <TouchableOpacity onPress={() => { setShowViewCompleted(false); setViewCompletedTemplate(null); }} style={{ padding: 10 }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              {submissionsForTemplate.length === 0 ? (
                <Text style={dynamicStyles.emptyText}>No submissions yet.</Text>
              ) : (
                submissionsForTemplate.map(s => (
                  <View key={s.id} style={dynamicStyles.submissionRow}>
                    <View style={dynamicStyles.cardHeaderRow}>
                      <View style={dynamicStyles.cardTitleWrap}>
                        <Text style={dynamicStyles.submissionName}>
                          {(s.filled_by_name && s.filled_by_name.trim()) || (s.filled_by_email && s.filled_by_email.trim()) || 'Unknown'}
                        </Text>
                        <Text style={dynamicStyles.submissionDate}>{fmtUtc(s.filled_at)}</Text>
                      </View>
                      <TouchableOpacity
                        style={dynamicStyles.kebabButton}
                        onPress={(e) => { e?.stopPropagation?.(); setSelectedSubmission(s); setSubmissionMenuInViewCompleted(true); setShowSubmissionMenu(true); }}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="ellipsis-vertical" size={22} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Upload code modal */}
      <Modal visible={showUploadCodeModal} transparent animationType="fade">
        <View style={dynamicStyles.modalOverlay}>
          <View style={[dynamicStyles.modalBox, { maxHeight: '85%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={[dynamicStyles.modalTitle, { flex: 1 }]} numberOfLines={2}>File Request Code — {uploadCodeTemplate?.name}</Text>
              <TouchableOpacity onPress={() => { setShowUploadCodeModal(false); setUploadCodeTemplate(null); }} style={{ padding: 10 }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>
            {uploadLinksLoading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
            ) : (
              <>
                {uploadLinksList.map(ul => (
                  <View key={ul.id} style={[dynamicStyles.submissionRow, { marginBottom: 10 }]}>
                    <Text style={dynamicStyles.submissionName}>Code: {ul.upload_code}</Text>
                    <TouchableOpacity onPress={() => { Clipboard.setString(ul.upload_url); Alert.alert('Copied', 'URL copied'); }} style={{ paddingVertical: 8, paddingRight: 8, marginTop: 4 }} activeOpacity={0.8}>
                      <Text style={[dynamicStyles.submissionDate, { color: colors.primary, fontWeight: '600' }]} numberOfLines={1}>Copy URL</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={[dynamicStyles.btn, dynamicStyles.btnAmber, dynamicStyles.btnFull, { marginTop: 12 }]} onPress={handleAddUploadCode} disabled={addingUploadCode} activeOpacity={0.8}>
                  <Text style={dynamicStyles.btnText}>{addingUploadCode ? 'Creating…' : 'Add upload code'}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
