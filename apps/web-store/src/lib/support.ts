const supportPhoneE164 = process.env.NEXT_PUBLIC_SUPPORT_PHONE_E164?.trim();
const supportPhoneDisplay = process.env.NEXT_PUBLIC_SUPPORT_PHONE_DISPLAY?.trim();
const supportWhatsappUrl = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP_URL?.trim();

const defaultSupportPhoneE164 = '+2347088167402';
const defaultSupportPhoneDisplay = '+234 708 816 7402';

export const supportContact = {
  phoneDisplay: supportPhoneDisplay || supportPhoneE164 || defaultSupportPhoneDisplay,
  phoneHref: `tel:${supportPhoneE164 || defaultSupportPhoneE164}`,
  whatsappUrl: supportWhatsappUrl || undefined,
  hours: process.env.NEXT_PUBLIC_SUPPORT_HOURS?.trim() || 'Daily pharmacy support',
};
