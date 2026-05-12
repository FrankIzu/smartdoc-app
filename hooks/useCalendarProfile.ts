import { useCallback, useState } from 'react';
import { apiClient } from '../services/api';

export type CalendarUserProfile = {
  id: number;
  email?: string;
  first_name?: string | null;
  last_name?: string | null;
  company_role?: string | null;
  is_system_admin?: boolean;
  /** 0 means personal (non-company) account — no company calendar scope. */
  company_id?: number;
};

export function useCalendarProfile() {
  const [profile, setProfile] = useState<CalendarUserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const raw = await apiClient.getUserProfile();
      const data = (raw as any)?.data;
      if (data?.id != null) {
        setProfile({
          id: Number(data.id),
          email: data.email,
          first_name: data.first_name,
          last_name: data.last_name,
          company_role: data.company_role ?? null,
          is_system_admin: !!data.is_system_admin,
          company_id: data.company_id != null ? Number(data.company_id) : 0,
        });
      } else {
        setProfile(null);
      }
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { profile, loading, refresh };
}

export function calendarIsCompanyAdmin(profile: CalendarUserProfile | null): boolean {
  if (!profile) return false;
  return profile.company_role === 'admin' || !!profile.is_system_admin;
}
