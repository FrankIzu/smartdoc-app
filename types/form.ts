export interface FormField {
  id: string;
  type: 'text' | 'email' | 'number' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'date' | 'time' | 'file';
  label: string;
  placeholder?: string;
  required: boolean;
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    errorMessage?: string;
  };
  options?: string[]; // For select, radio, checkbox fields
  defaultValue?: any;
  description?: string;
}

export interface Form {
  id: number;
  name: string;
  type: string;
  title: string;
  description: string;
  json_fields: FormField[];
  theme: string;
  template_id?: number;
  is_published: boolean;
  share_url: string;
  settings: FormSettings;
  created_at: string;
  modified_at: string;
  created_by: number;
  modified_by: number;
  response_count: number;
}

export interface FormSettings {
  collectEmail?: boolean;
  allowResponseEditing?: boolean;
  showProgressBar?: boolean;
  submitButtonText?: string;
  successMessage?: string;
  redirectUrl?: string;
  requireLogin?: boolean;
  allowMultipleSubmissions?: boolean;
  closeAfterDate?: string;
}

export interface FormTemplate {
  id: number;
  name: string;
  type: string;
  title: string;
  description: string;
  json_fields: FormField[];
  theme: string;
  created_at: string;
  created_by: string;
  is_active: boolean;
}

export interface FormResponse {
  id: number;
  form_id: number;
  respondent_email?: string;
  response_data: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  submitted_at: string;
  is_complete: boolean;
}

export interface CreateFormRequest {
  name: string;
  type?: string;
  title: string;
  description?: string;
  fields: FormField[];
  theme?: string;
  template_id?: number;
  is_public?: boolean;
  settings?: FormSettings;
}

export interface UpdateFormRequest {
  name?: string;
  title?: string;
  description?: string;
  fields?: FormField[];
  theme?: string;
  is_public?: boolean;
  settings?: FormSettings;
} 