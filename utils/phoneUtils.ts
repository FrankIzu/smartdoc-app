export interface CountryPhoneOption {
  code: string;
  name: string;
  flag: string;
}

/** Common countries for a global app — US listed first as default. */
export const COUNTRY_PHONE_OPTIONS: CountryPhoneOption[] = [
  { code: '+1', name: 'United States', flag: '🇺🇸' },
  { code: '+1', name: 'Canada', flag: '🇨🇦' },
  { code: '+61', name: 'Australia', flag: '🇦🇺' },
  { code: '+43', name: 'Austria', flag: '🇦🇹' },
  { code: '+32', name: 'Belgium', flag: '🇧🇪' },
  { code: '+55', name: 'Brazil', flag: '🇧🇷' },
  { code: '+86', name: 'China', flag: '🇨🇳' },
  { code: '+45', name: 'Denmark', flag: '🇩🇰' },
  { code: '+20', name: 'Egypt', flag: '🇪🇬' },
  { code: '+358', name: 'Finland', flag: '🇫🇮' },
  { code: '+33', name: 'France', flag: '🇫🇷' },
  { code: '+49', name: 'Germany', flag: '🇩🇪' },
  { code: '+233', name: 'Ghana', flag: '🇬🇭' },
  { code: '+91', name: 'India', flag: '🇮🇳' },
  { code: '+62', name: 'Indonesia', flag: '🇮🇩' },
  { code: '+353', name: 'Ireland', flag: '🇮🇪' },
  { code: '+39', name: 'Italy', flag: '🇮🇹' },
  { code: '+81', name: 'Japan', flag: '🇯🇵' },
  { code: '+254', name: 'Kenya', flag: '🇰🇪' },
  { code: '+52', name: 'Mexico', flag: '🇲🇽' },
  { code: '+31', name: 'Netherlands', flag: '🇳🇱' },
  { code: '+64', name: 'New Zealand', flag: '🇳🇿' },
  { code: '+234', name: 'Nigeria', flag: '🇳🇬' },
  { code: '+47', name: 'Norway', flag: '🇳🇴' },
  { code: '+92', name: 'Pakistan', flag: '🇵🇰' },
  { code: '+63', name: 'Philippines', flag: '🇵🇭' },
  { code: '+48', name: 'Poland', flag: '🇵🇱' },
  { code: '+351', name: 'Portugal', flag: '🇵🇹' },
  { code: '+966', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: '+65', name: 'Singapore', flag: '🇸🇬' },
  { code: '+27', name: 'South Africa', flag: '🇿🇦' },
  { code: '+82', name: 'South Korea', flag: '🇰🇷' },
  { code: '+34', name: 'Spain', flag: '🇪🇸' },
  { code: '+46', name: 'Sweden', flag: '🇸🇪' },
  { code: '+41', name: 'Switzerland', flag: '🇨🇭' },
  { code: '+90', name: 'Turkey', flag: '🇹🇷' },
  { code: '+971', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: '+44', name: 'United Kingdom', flag: '🇬🇧' },
];

const UNIQUE_COUNTRY_CODES = Array.from(new Set(COUNTRY_PHONE_OPTIONS.map((c) => c.code))).sort(
  (a, b) => b.length - a.length,
);

export function parsePhoneNumber(value: string): { countryCode: string; nationalDigits: string } {
  const trimmed = (value || '').trim();
  if (!trimmed) return { countryCode: '+1', nationalDigits: '' };

  if (trimmed.startsWith('+')) {
    for (const code of UNIQUE_COUNTRY_CODES) {
      if (trimmed.startsWith(code)) {
        const nationalDigits = trimmed.slice(code.length).replace(/\D/g, '');
        return { countryCode: code, nationalDigits };
      }
    }
  }

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.startsWith('1') && digitsOnly.length === 11) {
    return { countryCode: '+1', nationalDigits: digitsOnly.slice(1) };
  }

  return { countryCode: '+1', nationalDigits: digitsOnly };
}

export function buildPhoneNumber(countryCode: string, nationalDigits: string): string {
  const digits = nationalDigits.replace(/\D/g, '');
  if (!digits) return '';
  return `${countryCode}${digits}`;
}

export function formatNationalDisplay(countryCode: string, nationalDigits: string): string {
  const digits = nationalDigits.replace(/\D/g, '');
  if (!digits) return '';

  if (countryCode === '+1') {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
  }

  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  if (digits.length <= 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)} ${digits.slice(10)}`;
}

export function isValidPhoneNumber(value: string, minNationalDigits = 7): boolean {
  const full = value.trim();
  if (/^\+[1-9]\d{7,14}$/.test(full)) return true;
  const { nationalDigits } = parsePhoneNumber(value);
  return nationalDigits.replace(/\D/g, '').length >= minNationalDigits;
}
