export type InviteDeliveryResponse = {
  success?: boolean;
  message?: string;
  delivery_warning?: string | null;
  delivery?: {
    email_requested?: boolean;
    phone_requested?: boolean;
    email_sent?: boolean | null;
    sms_sent?: boolean | null;
  };
};

export function inviteDeliveryFailed(data: InviteDeliveryResponse): boolean {
  const delivery = data.delivery;
  if (!delivery) return false;
  return delivery.email_sent === false || delivery.sms_sent === false;
}

export function inviteDeliveryMessage(data: InviteDeliveryResponse): string {
  const parts = [data.message || 'Invite sent'];
  if (data.delivery_warning) parts.push(data.delivery_warning);
  return parts.join(' ');
}

/** Mobile: show toast for invite create/resend delivery result. */
export function showInviteDeliveryToastMobile(
  data: InviteDeliveryResponse,
  Toast: { show: (opts: { type: string; text1: string; text2?: string }) => void },
): void {
  const failed = inviteDeliveryFailed(data);
  Toast.show({
    type: failed ? 'error' : 'success',
    text1: failed ? 'Delivery issue' : data.message || 'Invite sent',
    text2: failed ? inviteDeliveryMessage(data) : undefined,
  });
}
