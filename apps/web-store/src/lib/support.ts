const supportPhoneE164 = process.env.NEXT_PUBLIC_SUPPORT_PHONE_E164?.trim();
const supportPhoneDisplay = process.env.NEXT_PUBLIC_SUPPORT_PHONE_DISPLAY?.trim();
const supportWhatsappUrl = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP_URL?.trim();

export const supportContact = {
  phoneDisplay: supportPhoneDisplay || supportPhoneE164 || 'Phone support pending',
  phoneHref: supportPhoneE164 ? `tel:${supportPhoneE164}` : undefined,
  whatsappUrl: supportWhatsappUrl || undefined,
  hours: process.env.NEXT_PUBLIC_SUPPORT_HOURS?.trim() || 'Daily pharmacy support',
};
