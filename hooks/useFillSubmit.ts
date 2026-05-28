import { useCallback, useState, type RefObject } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '../app/context/auth';
import type { FillCaptureHostHandle } from '../components/signatures/fill/FillCaptureHost';
import type { PrepareEditorActions, PrepareEditorState } from './usePrepareEditor';
import { createFillLink, submitFilledDocument } from '../services/fillApi';
import { buildTemplateFieldValues, validateRequiredFillFields } from '../utils/fillSubmit';

export interface FillSubmitResult {
  submissionId?: number;
  filledFileId?: number;
  templateName?: string;
}

interface Options {
  templateId: string;
  templateName?: string;
  editor: PrepareEditorState & PrepareEditorActions;
  fieldValues: Record<string, unknown>;
  captureHostRef: RefObject<FillCaptureHostHandle | null>;
}

export function useFillSubmit({
  templateId,
  templateName,
  editor,
  fieldValues,
  captureHostRef,
}: Options) {
  const { user } = useAuth();
  const [isFinishing, setIsFinishing] = useState(false);

  const finish = useCallback(async (): Promise<FillSubmitResult | null> => {
    const validationError = validateRequiredFillFields(editor.fields, fieldValues);
    if (validationError) {
      Alert.alert('Incomplete document', validationError);
      return null;
    }

    const filledByName =
      user?.name?.trim() ||
      [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() ||
      user?.username?.trim() ||
      'User';
    const filledByEmail = user?.email?.trim();

    setIsFinishing(true);
    try {
      if (editor.isDirty) {
        const saved = await editor.save(templateId);
        if (!saved) return null;
      }

      const captureHost = captureHostRef.current;
      if (!captureHost) {
        throw new Error('Could not prepare document preview');
      }

      const pageImages = await captureHost.captureAllPages();
      if (!pageImages.some(Boolean)) {
        throw new Error('Could not capture document pages');
      }

      const { token } = await createFillLink(templateId, { link_type: 'edit' });
      const templateFieldValues = buildTemplateFieldValues(editor.fields, fieldValues);

      const res = await submitFilledDocument({
        token,
        page_images: pageImages.filter(Boolean),
        template_field_values: templateFieldValues,
        filled_by_name: filledByName,
        filled_by_email: filledByEmail,
        annotation_json: [],
      });

      if (!res.success && !res.filled_file_id && !res.submission_id) {
        throw new Error(res.message || 'Submission failed');
      }

      return {
        submissionId: res.submission_id,
        filledFileId: res.filled_file_id,
        templateName: templateName ?? editor.templateName,
      };
    } catch (e: unknown) {
      Alert.alert('Could not finish document', e instanceof Error ? e.message : 'Try again.');
      return null;
    } finally {
      setIsFinishing(false);
    }
  }, [
    captureHostRef,
    editor,
    fieldValues,
    templateId,
    templateName,
    user?.email,
    user?.first_name,
    user?.last_name,
    user?.name,
    user?.username,
  ]);

  return { finish, isFinishing };
}
