import type { WizardField } from '../types/signature';
import { fieldImageUri } from './signatureRuntime';

export type TemplateFieldValuePayload = {
  image?: string;
  checked?: boolean;
  text?: string;
};

export function buildTemplateFieldValues(
  fields: WizardField[],
  fieldValues: Record<string, unknown>,
): Record<string, TemplateFieldValuePayload> {
  const out: Record<string, TemplateFieldValuePayload> = {};
  for (const field of fields) {
    if (field.deleted) continue;
    const val = fieldValues[field.id];
    if (val == null) continue;

    if (field.type === 'signature' || field.type === 'initials') {
      const image = fieldImageUri(val);
      if (image) out[field.id] = { image };
      continue;
    }
    if (field.type === 'checkbox') {
      out[field.id] = { checked: Boolean(val) };
      continue;
    }
    if (field.type === 'text' || field.type === 'date') {
      const text = typeof val === 'string' ? val.trim() : '';
      if (text) out[field.id] = { text };
    }
  }
  return out;
}

export function validateRequiredFillFields(
  fields: WizardField[],
  fieldValues: Record<string, unknown>,
): string | null {
  const required = fields.filter((f) => !f.deleted && f.required);
  const missing = required.filter((field) => {
    const val = fieldValues[field.id];
    if (field.type === 'signature' || field.type === 'initials') {
      return !fieldImageUri(val);
    }
    if (field.type === 'checkbox') {
      return false;
    }
    if (field.type === 'text' || field.type === 'date') {
      return !(typeof val === 'string' && val.trim());
    }
    return val == null;
  });

  if (missing.length === 0) return null;
  return `Please complete required fields: ${missing.map((f) => f.label || f.type).join(', ')}`;
}

export function hasAnyFillValue(
  fields: WizardField[],
  fieldValues: Record<string, unknown>,
): boolean {
  return Object.keys(buildTemplateFieldValues(fields, fieldValues)).length > 0;
}
