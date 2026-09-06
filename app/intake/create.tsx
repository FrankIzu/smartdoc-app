import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AdaptiveListPickerModal from '../../components/AdaptiveListPickerModal';
import ClientsButton from '../../components/clients/ClientsButton';
import { FeedbackTouchable } from '../../components/FeedbackTouchable';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiService } from '../../services/api';
import { getClient, primaryEmail, setItemClients } from '../../services/clientsApi';
import { INTAKE_REMINDER_PRESETS, type IntakeTemplate, type ReminderPreset } from '../../types/intake';

import AppBackButton from '../../components/AppBackButton';
import AppHeaderTitle from '../../components/AppHeaderTitle';

interface ChecklistItemForm {
  label: string;
  description: string;
  required: boolean;
}

interface AuthorizedSenderForm {
  name: string;
  email: string;
}

interface FolderOption {
  id: number;
  name: string;
}

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function CreateIntakeScreen() {
  const router = useRouter();
  const { template: templateParam, client_id: clientIdParam } = useLocalSearchParams<{
    template?: string;
    client_id?: string;
  }>();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);

  const [templates, setTemplates] = useState<IntakeTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [folders, setFolders] = useState<FolderOption[]>([]);

  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPrimaryEmail, setClientPrimaryEmail] = useState('');
  const [authorizedSenders, setAuthorizedSenders] = useState<AuthorizedSenderForm[]>([{ name: '', email: '' }]);
  const [items, setItems] = useState<ChecklistItemForm[]>([{ label: '', description: '', required: true }]);
  const [dueAt, setDueAt] = useState('');
  const [destinationFolderId, setDestinationFolderId] = useState<number | null>(null);
  const [reminderPreset, setReminderPreset] = useState<ReminderPreset>('standard');
  const [customReminder, setCustomReminder] = useState({ first: 48, repeat: 72, max: 4 });
  const [autoVerify, setAutoVerify] = useState(false);
  const [selectedClientIds, setSelectedClientIds] = useState<number[]>([]);

  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [templateNameForSave, setTemplateNameForSave] = useState('');
  const [templateIndustryForSave, setTemplateIndustryForSave] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    const raw = Array.isArray(clientIdParam) ? clientIdParam[0] : clientIdParam;
    const id = typeof raw === 'string' && /^\d+$/.test(raw) ? parseInt(raw, 10) : null;
    if (id != null) {
      setSelectedClientIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
  }, [clientIdParam]);

  useEffect(() => {
    (async () => {
      try {
        const response = await apiService.getIntakeTemplates();
        if (response.success) {
          const loaded = response.templates || [];
          setTemplates(loaded);
          const templateId = templateParam ? Number(templateParam) : NaN;
          if (!isNaN(templateId) && templateId > 0) {
            const template = loaded.find((t: IntakeTemplate) => t.id === templateId);
            if (template) {
              setSelectedTemplateId(templateId);
              setItems(
                template.items.length > 0
                  ? template.items.map((i: IntakeTemplate['items'][0]) => ({
                      label: i.label,
                      description: i.description || '',
                      required: i.required,
                    }))
                  : [{ label: '', description: '', required: true }],
              );
            }
          }
        }
      } catch (error) {
        console.error('Load intake templates error:', error);
      }
    })();
    (async () => {
      try {
        const response = await apiService.listFolders({ limit: 500 });
        if (response.success) {
          setFolders((response.folders || []).map((f: any) => ({ id: f.id, name: f.name })));
        }
      } catch (error) {
        console.error('Load folders error:', error);
      }
    })();
  }, []);

  const applyTemplate = (templateId: number | null, sourceTemplates?: IntakeTemplate[]) => {
    setSelectedTemplateId(templateId);
    if (templateId === null) return;
    const list = sourceTemplates ?? templates;
    const template = list.find((t) => t.id === templateId);
    if (!template) return;
    setItems(
      template.items.length > 0
        ? template.items.map((i) => ({ label: i.label, description: i.description || '', required: i.required }))
        : [{ label: '', description: '', required: true }]
    );
  };

  const addAuthorizedSender = () => setAuthorizedSenders((prev) => [...prev, { name: '', email: '' }]);
  const removeAuthorizedSender = (idx: number) => setAuthorizedSenders((prev) => prev.filter((_, i) => i !== idx));
  const updateAuthorizedSender = (idx: number, field: 'name' | 'email', value: string) => {
    setAuthorizedSenders((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const addItem = () => setItems((prev) => [...prev, { label: '', description: '', required: true }]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof ChecklistItemForm, value: string | boolean) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  const openDatePicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: dueAt ? new Date(dueAt) : new Date(),
        mode: 'date',
        onChange: (event, date) => {
          if (event?.type === 'set' && date) setDueAt(toLocalDateString(date));
        },
      });
    } else {
      setShowDatePicker(true);
    }
  };

  const handleSaveAsTemplate = async () => {
    const validItems = items.filter((i) => i.label.trim());
    if (validItems.length === 0) {
      Alert.alert('Error', 'Add at least one checklist item first');
      return;
    }
    if (!templateNameForSave.trim()) {
      Alert.alert('Error', 'Template name is required');
      return;
    }
    setSavingTemplate(true);
    try {
      const response = await apiService.createIntakeTemplate({
        name: templateNameForSave.trim(),
        industry_tag: templateIndustryForSave.trim() || null,
        items: validItems,
      });
      if (response.success) {
        setShowSaveTemplateModal(false);
        setTemplateNameForSave('');
        setTemplateIndustryForSave('');
        if (response.already_exists || response.unchanged) {
          Alert.alert(
            'Already saved',
            response.message || 'No changes were made — this template is already saved.',
          );
        } else {
          Alert.alert('Saved', 'Template saved');
        }
        const templatesResponse = await apiService.getIntakeTemplates();
        if (templatesResponse.success) setTemplates(templatesResponse.templates || []);
      } else {
        Alert.alert('Error', response.message || 'Failed to save template');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save template');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Title is required');
      return;
    }
    const validItems = items.filter((i) => i.label.trim());
    if (validItems.length === 0) {
      Alert.alert('Error', 'Add at least one checklist item');
      return;
    }
    const validSenders = authorizedSenders.filter((s) => s.email.trim());

    const reminderFields =
      reminderPreset === 'custom'
        ? {
            reminder_preset: 'custom' as const,
            reminder_first_after_hours: customReminder.first,
            reminder_repeat_every_hours: customReminder.repeat,
            reminder_max_count: customReminder.max,
          }
        : { reminder_preset: reminderPreset };

    setSubmitting(true);
    try {
      const response = await apiService.createIntake({
        title: title.trim(),
        client_name: clientName.trim() || null,
        client_primary_email: clientPrimaryEmail.trim() || null,
        authorized_senders: validSenders,
        items: validItems.map((i) => ({
          label: i.label.trim(),
          description: i.description.trim() || null,
          required: i.required,
        })),
        due_at: dueAt || null,
        destination_folder_id: destinationFolderId,
        template_id: selectedTemplateId,
        auto_verify_high_confidence: autoVerify,
        client_ids: selectedClientIds.length ? selectedClientIds : undefined,
        ...reminderFields,
      });
      if (response.success) {
        const intake = (response as any).intake;
        const intakeId = intake?.id as number | undefined;
        if (intakeId && selectedClientIds.length > 0) {
          try {
            await setItemClients({
              client_ids: selectedClientIds,
              item_type: 'intake',
              item_id: intakeId,
            });
            const uploadLinkId = intake?.upload_link_id as number | undefined;
            if (uploadLinkId) {
              await setItemClients({
                client_ids: selectedClientIds,
                item_type: 'file_upload_link',
                item_id: uploadLinkId,
              });
            }
          } catch (linkErr) {
            console.error('Error linking clients to intake:', linkErr);
          }
        }
        router.replace(`/intake/${intakeId}`);
      } else {
        Alert.alert('Error', response.message || 'Failed to create Intake');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create Intake');
    } finally {
      setSubmitting(false);
    }
  };

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      backgroundColor: colors.headerBackground,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: { fontSize: 18, fontWeight: '600', color: colors.text },
    placeholder: { width: 24 },
    content: { flex: 1 },
    section: {
      backgroundColor: colors.card,
      marginTop: 8,
      padding: 16,
    },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 12 },
    sectionSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: -8, marginBottom: 12 },
    inputGroup: { marginBottom: 16 },
    label: { fontSize: 14, fontWeight: '500', color: colors.text, marginBottom: 6 },
    required: { color: '#FF3B30' },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
    },
    row: { flexDirection: 'row', gap: 10 },
    flex1: { flex: 1 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipSelected: {
      borderColor: '#007AFF',
      backgroundColor: colors.isDark ? 'rgba(59, 130, 246, 0.24)' : '#E3F2FD',
    },
    chipText: { fontSize: 13, color: colors.text },
    chipTextSelected: { color: '#007AFF', fontWeight: '600' },
    senderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    smallInput: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 14,
      color: colors.text,
    },
    addLink: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    addLinkText: { fontSize: 14, color: '#007AFF', fontWeight: '500', marginLeft: 4 },
    itemCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 10,
      marginBottom: 10,
    },
    itemTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    requiredToggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    requiredToggleText: { fontSize: 11, color: colors.textSecondary },
    descInput: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 13,
      color: colors.textSecondary,
    },
    sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    linkText: { fontSize: 13, color: '#007AFF', fontWeight: '500' },
    pickerButton: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    pickerButtonText: { fontSize: 15, color: colors.text },
    hint: { fontSize: 12, color: colors.textSecondary, marginTop: 6 },
    presetOption: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 10,
      marginBottom: 8,
    },
    presetOptionSelected: {
      borderColor: '#007AFF',
      backgroundColor: colors.isDark ? 'rgba(59, 130, 246, 0.24)' : '#E3F2FD',
    },
    presetOptionTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
    presetOptionDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    customRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    customField: { flex: 1 },
    customLabel: { fontSize: 11, color: colors.textSecondary, marginBottom: 4 },
    switchRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 4 },
    switchLabelCol: { flex: 1 },
    switchLabel: { fontSize: 14, color: colors.text },
    switchSubLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    footer: {
      padding: 16,
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    createButton: { backgroundColor: '#007AFF', paddingVertical: 15, borderRadius: 8, alignItems: 'center' },
    disabledButton: { opacity: 0.5 },
    createButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      maxHeight: '80%',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
    modalOption: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalOptionText: { fontSize: 15, color: colors.text },
    modalOptionSelected: { color: '#007AFF', fontWeight: '600' },
    saveTemplateModalContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
  }), [colors]);

  const reminderOptions: { key: 'gentle' | 'standard' | 'urgent'; label: string; desc: string }[] = [
    { key: 'gentle', label: 'Gentle', desc: 'First after 3 days, every 5 days, up to 3 times' },
    { key: 'standard', label: 'Standard', desc: 'First after 2 days, every 3 days, up to 4 times' },
    { key: 'urgent', label: 'Urgent', desc: 'First after 1 day, daily, up to 6 times' },
  ];

  return (
    <SafeAreaView style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <AppBackButton />
        <AppHeaderTitle>New Intake</AppHeaderTitle>
        <View style={dynamicStyles.placeholder} />
      </View>

      <ScrollView style={dynamicStyles.content} showsVerticalScrollIndicator={false}>
        {templates.length > 0 && (
          <View style={dynamicStyles.section}>
            <Text style={dynamicStyles.sectionTitle}>Start from template (optional)</Text>
            <View style={dynamicStyles.chipsRow}>
              <TouchableOpacity
                style={[dynamicStyles.chip, selectedTemplateId === null && dynamicStyles.chipSelected]}
                onPress={() => applyTemplate(null)}
              >
                <Text style={[dynamicStyles.chipText, selectedTemplateId === null && dynamicStyles.chipTextSelected]}>
                  From scratch
                </Text>
              </TouchableOpacity>
              {templates.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[dynamicStyles.chip, selectedTemplateId === t.id && dynamicStyles.chipSelected]}
                  onPress={() => applyTemplate(t.id)}
                >
                  <Text style={[dynamicStyles.chipText, selectedTemplateId === t.id && dynamicStyles.chipTextSelected]}>
                    {t.name}{t.industry_tag ? ` (${t.industry_tag})` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Intake details</Text>
          <View style={dynamicStyles.inputGroup}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={[dynamicStyles.label, { marginBottom: 0 }]}>Title <Text style={dynamicStyles.required}>*</Text></Text>
              <ClientsButton
                selectedClientIds={selectedClientIds}
                onChange={async (ids) => {
                  setSelectedClientIds(ids);
                  if (ids[0] && (!clientName.trim() || !clientPrimaryEmail.trim())) {
                    try {
                      const c = await getClient(ids[0]);
                      if (!clientName.trim()) setClientName(c.display_name);
                      const pe = primaryEmail(c);
                      if (pe && !clientPrimaryEmail.trim()) setClientPrimaryEmail(pe);
                    } catch {
                      /* ignore */
                    }
                  }
                }}
                allowCreate
                compact
              />
            </View>
            <TextInput
              style={dynamicStyles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. 2025 Tax Documents — Jane Smith"
              placeholderTextColor={colors.textLight}
              maxLength={300}
            />
          </View>
          <View style={dynamicStyles.row}>
            <View style={[dynamicStyles.inputGroup, dynamicStyles.flex1]}>
              <Text style={dynamicStyles.label}>Client name</Text>
              <TextInput
                style={dynamicStyles.input}
                value={clientName}
                onChangeText={setClientName}
                placeholderTextColor={colors.textLight}
              />
            </View>
            <View style={[dynamicStyles.inputGroup, dynamicStyles.flex1]}>
              <Text style={dynamicStyles.label}>Due date</Text>
              <TouchableOpacity style={dynamicStyles.pickerButton} onPress={openDatePicker}>
                <Text style={dynamicStyles.pickerButtonText}>{dueAt || 'None'}</Text>
                <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={dynamicStyles.inputGroup}>
            <Text style={dynamicStyles.label}>Primary client email</Text>
            <TextInput
              style={dynamicStyles.input}
              value={clientPrimaryEmail}
              onChangeText={setClientPrimaryEmail}
              placeholder="client@example.com"
              placeholderTextColor={colors.textLight}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        </View>

        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Authorized senders</Text>
          <Text style={dynamicStyles.sectionSubtitle}>
            Files forwarded to your email (or synced from Gmail/Outlook) from these addresses are automatically
            routed to this Intake. Also used to personalize reminder emails.
          </Text>
          {authorizedSenders.map((sender, idx) => (
            <View key={idx} style={dynamicStyles.senderRow}>
              <TextInput
                style={[dynamicStyles.smallInput, { flex: 1 }]}
                value={sender.name}
                onChangeText={(v) => updateAuthorizedSender(idx, 'name', v)}
                placeholder="Name"
                placeholderTextColor={colors.textLight}
              />
              <TextInput
                style={[dynamicStyles.smallInput, { flex: 1.5 }]}
                value={sender.email}
                onChangeText={(v) => updateAuthorizedSender(idx, 'email', v)}
                placeholder="email@example.com"
                placeholderTextColor={colors.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => removeAuthorizedSender(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="trash-outline" size={18} color={colors.textLight} />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={dynamicStyles.addLink} onPress={addAuthorizedSender}>
            <Ionicons name="add-circle-outline" size={18} color="#007AFF" />
            <Text style={dynamicStyles.addLinkText}>Add another sender</Text>
          </TouchableOpacity>
        </View>

        <View style={dynamicStyles.section}>
          <View style={dynamicStyles.sectionHeaderRow}>
            <Text style={[dynamicStyles.sectionTitle, { marginBottom: 0 }]}>Checklist</Text>
            <TouchableOpacity onPress={() => setShowSaveTemplateModal(true)}>
              <Text style={dynamicStyles.linkText}>Template</Text>
            </TouchableOpacity>
          </View>
          {items.map((item, idx) => (
            <View key={idx} style={dynamicStyles.itemCard}>
              <View style={dynamicStyles.itemTopRow}>
                <TextInput
                  style={[dynamicStyles.smallInput, { flex: 1 }]}
                  value={item.label}
                  onChangeText={(v) => updateItem(idx, 'label', v)}
                  placeholder="e.g. Bank Statement (last 3 months)"
                  placeholderTextColor={colors.textLight}
                />
                <View style={dynamicStyles.requiredToggle}>
                  <Text style={dynamicStyles.requiredToggleText}>Required</Text>
                  <Switch
                    value={item.required}
                    onValueChange={(v) => updateItem(idx, 'required', v)}
                    trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
                    thumbColor={colors.switchThumbAndroid(item.required)}
                    ios_backgroundColor={colors.switchTrackOff}
                  />
                </View>
                <TouchableOpacity onPress={() => removeItem(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={18} color={colors.textLight} />
                </TouchableOpacity>
              </View>
              <TextInput
                style={dynamicStyles.descInput}
                value={item.description}
                onChangeText={(v) => updateItem(idx, 'description', v)}
                placeholder="Describe what this document looks like (optional)"
                placeholderTextColor={colors.textLight}
              />
            </View>
          ))}
          <TouchableOpacity style={dynamicStyles.addLink} onPress={addItem}>
            <Ionicons name="add-circle-outline" size={18} color="#007AFF" />
            <Text style={dynamicStyles.addLinkText}>Add checklist item</Text>
          </TouchableOpacity>
        </View>

        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Automation</Text>
          <View style={dynamicStyles.inputGroup}>
            <Text style={dynamicStyles.label}>Destination folder (optional)</Text>
            <TouchableOpacity style={dynamicStyles.pickerButton} onPress={() => setShowFolderPicker(true)}>
              <Text style={dynamicStyles.pickerButtonText}>
                {destinationFolderId ? (folders.find((f) => f.id === destinationFolderId)?.name || 'Selected folder') : 'Leave files where they land'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={dynamicStyles.hint}>Matched documents are automatically filed here.</Text>
          </View>

          <View style={dynamicStyles.inputGroup}>
            <Text style={dynamicStyles.label}>Reminder cadence</Text>
            {reminderOptions.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[dynamicStyles.presetOption, reminderPreset === opt.key && dynamicStyles.presetOptionSelected]}
                onPress={() => {
                  setReminderPreset(opt.key);
                  setCustomReminder(INTAKE_REMINDER_PRESETS[opt.key]);
                }}
              >
                <Text style={dynamicStyles.presetOptionTitle}>{opt.label}</Text>
                <Text style={dynamicStyles.presetOptionDesc}>{opt.desc}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[dynamicStyles.presetOption, reminderPreset === 'custom' && dynamicStyles.presetOptionSelected]}
              onPress={() => setReminderPreset('custom')}
            >
              <Text style={dynamicStyles.presetOptionTitle}>Custom</Text>
            </TouchableOpacity>
            {reminderPreset === 'custom' && (
              <View style={dynamicStyles.customRow}>
                <View style={dynamicStyles.customField}>
                  <Text style={dynamicStyles.customLabel}>First after (hrs)</Text>
                  <TextInput
                    style={dynamicStyles.smallInput}
                    value={String(customReminder.first)}
                    onChangeText={(v) => setCustomReminder((p) => ({ ...p, first: parseInt(v, 10) || 1 }))}
                    keyboardType="numeric"
                  />
                </View>
                <View style={dynamicStyles.customField}>
                  <Text style={dynamicStyles.customLabel}>Repeat every (hrs)</Text>
                  <TextInput
                    style={dynamicStyles.smallInput}
                    value={String(customReminder.repeat)}
                    onChangeText={(v) => setCustomReminder((p) => ({ ...p, repeat: parseInt(v, 10) || 1 }))}
                    keyboardType="numeric"
                  />
                </View>
                <View style={dynamicStyles.customField}>
                  <Text style={dynamicStyles.customLabel}>Max reminders</Text>
                  <TextInput
                    style={dynamicStyles.smallInput}
                    value={String(customReminder.max)}
                    onChangeText={(v) => setCustomReminder((p) => ({ ...p, max: parseInt(v, 10) || 1 }))}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            )}
          </View>

          <View style={dynamicStyles.switchRow}>
            <Switch
              value={autoVerify}
              onValueChange={setAutoVerify}
              trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
              thumbColor={colors.switchThumbAndroid(autoVerify)}
              ios_backgroundColor={colors.switchTrackOff}
            />
            <View style={dynamicStyles.switchLabelCol}>
              <Text style={dynamicStyles.switchLabel}>Automatically verify AI matches &ge; 95% confidence</Text>
              <Text style={dynamicStyles.switchSubLabel}>
                Off by default. When on, very high-confidence matches skip manual review and go straight to
                &quot;Verified&quot; (always flagged as auto-verified).
              </Text>
            </View>
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      <View style={dynamicStyles.footer}>
        <FeedbackTouchable
          style={[dynamicStyles.createButton, submitting && dynamicStyles.disabledButton]}
          onPress={handleSubmit}
          disabled={submitting}
          loading={submitting}
          spinnerColor="#fff"
        >
          <Text style={dynamicStyles.createButtonText}>Create Intake</Text>
        </FeedbackTouchable>
      </View>

      {/* Destination folder picker */}
      <AdaptiveListPickerModal
        visible={showFolderPicker}
        onClose={() => setShowFolderPicker(false)}
        title="Destination folder"
        itemCount={folders.length + 1}
      >
        <TouchableOpacity
          style={dynamicStyles.modalOption}
          onPress={() => {
            setDestinationFolderId(null);
            setShowFolderPicker(false);
          }}
        >
          <Text style={[dynamicStyles.modalOptionText, destinationFolderId === null && dynamicStyles.modalOptionSelected]}>
            Leave files where they land
          </Text>
        </TouchableOpacity>
        {folders.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={dynamicStyles.modalOption}
            onPress={() => {
              setDestinationFolderId(f.id);
              setShowFolderPicker(false);
            }}
          >
            <Text style={[dynamicStyles.modalOptionText, destinationFolderId === f.id && dynamicStyles.modalOptionSelected]}>
              {f.name}
            </Text>
          </TouchableOpacity>
        ))}
      </AdaptiveListPickerModal>

      {/* iOS date picker */}
      <Modal visible={showDatePicker} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setShowDatePicker(false)}>
        <View style={dynamicStyles.modalOverlay}>
          <View style={dynamicStyles.modalCard}>
            <View style={dynamicStyles.modalHeader}>
              <TouchableOpacity onPress={() => { setDueAt(''); setShowDatePicker(false); }}>
                <Text style={dynamicStyles.linkText}>Clear</Text>
              </TouchableOpacity>
              <Text style={dynamicStyles.modalTitle}>Due date</Text>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Text style={dynamicStyles.linkText}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={dueAt ? new Date(dueAt) : new Date()}
              mode="date"
              display="spinner"
              onChange={(_, d) => { if (d) setDueAt(toLocalDateString(d)); }}
              textColor={colors.text}
            />
          </View>
        </View>
      </Modal>

      {/* Save Template modal */}
      <Modal visible={showSaveTemplateModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSaveTemplateModal(false)}>
        <SafeAreaView style={dynamicStyles.saveTemplateModalContainer} edges={['left', 'right', 'bottom']}>
          <View style={[dynamicStyles.modalHeader, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity onPress={() => setShowSaveTemplateModal(false)}>
              <Text style={dynamicStyles.linkText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={dynamicStyles.modalTitle}>Template</Text>
            <FeedbackTouchable onPress={handleSaveAsTemplate} disabled={savingTemplate} loading={savingTemplate} spinnerColor="#007AFF" replaceWithSpinner={false}>
              <Text style={[dynamicStyles.linkText, savingTemplate && { opacity: 0.5 }]}>
                {savingTemplate ? 'Saving...' : 'Save'}
              </Text>
            </FeedbackTouchable>
          </View>
          <View style={{ padding: 16 }}>
            <View style={dynamicStyles.inputGroup}>
              <Text style={dynamicStyles.label}>Template name</Text>
              <TextInput
                style={dynamicStyles.input}
                value={templateNameForSave}
                onChangeText={setTemplateNameForSave}
                placeholder="e.g. Individual Tax Prep Checklist"
                placeholderTextColor={colors.textLight}
                autoFocus
              />
            </View>
            <View style={dynamicStyles.inputGroup}>
              <Text style={dynamicStyles.label}>Industry tag (optional)</Text>
              <TextInput
                style={dynamicStyles.input}
                value={templateIndustryForSave}
                onChangeText={setTemplateIndustryForSave}
                placeholder="e.g. accounting, property_management"
                placeholderTextColor={colors.textLight}
              />
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
