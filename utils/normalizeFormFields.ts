import type { FormField } from '../types/form';

const SUPPORTED_FIELD_TYPES = new Set([
  'text',
  'email',
  'phone',
  'textarea',
  'select',
  'radio',
  'checkbox',
  'date',
  'number',
]);

/** Normalize route/API field payloads into a flat FormField[] safe to render. */
export function normalizeFormFields(raw: unknown): FormField[] {
  let list: unknown[] = [];
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === 'object') {
    const nested = (raw as { fields?: unknown }).fields;
    if (Array.isArray(nested)) list = nested;
  }

  return list
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object' && !Array.isArray(f))
    .map((f, index) => {
      const id = String(f.id ?? f.name ?? f.key ?? `field_${index + 1}`);
      const typeRaw = String(f.type ?? 'text').toLowerCase();
      const type = (SUPPORTED_FIELD_TYPES.has(typeRaw) ? typeRaw : 'text') as FormField['type'];
      const rawOpts = f.options ?? f.choices ?? f.enum;
      const options = Array.isArray(rawOpts)
        ? rawOpts.map((o) =>
            typeof o === 'string'
              ? o
              : String(
                  (o as { label?: string; value?: string })?.label ??
                    (o as { value?: string })?.value ??
                    o,
                ),
          )
        : type === 'select' || type === 'radio' || type === 'checkbox'
          ? ['Option 1']
          : undefined;
      return {
        id,
        type,
        label: String(f.label ?? f.title ?? `Field ${index + 1}`),
        placeholder: f.placeholder != null ? String(f.placeholder) : undefined,
        required: !!f.required,
        options,
        validation: f.validation as FormField['validation'],
      } as FormField;
    });
}

export function countFormFields(raw: unknown): number {
  return normalizeFormFields(raw).length;
}

export function fieldDisplayLabel(field: Pick<FormField, 'label'> & { title?: string }): string {
  return field.label ?? field.title ?? 'field';
}
