/**
 * Safely convert API response/error to string for Alert.alert and native APIs.
 * React Native's Alert expects string parameters; passing objects causes:
 * "The 1st argument cannot be cast to type String" / "Conversion from JavaScript value of type 'object' to native 'String' failed"
 */
export function toAlertMessage(value: unknown, fallback: string): string {
  if (value == null) return fallback;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
