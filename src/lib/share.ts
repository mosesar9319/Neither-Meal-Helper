export function absoluteUrl(path: string): string {
  return `${window.location.origin}${path}`;
}

export function whatsappUrl(text: string, phone?: string): string {
  const digits = phone ? toWhatsappNumber(phone) : '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Israeli local numbers (05x…) become 9725x…; anything else keeps its digits. */
export function toWhatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
