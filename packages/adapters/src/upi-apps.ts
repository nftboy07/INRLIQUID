import type { UpiApp, UpiAppLinks } from '@inrliquid/domain';

const APP_HANDLES: Record<Exclude<UpiApp, 'other'>, string[]> = {
  paytm: ['paytm', 'ptaxis', 'paytmqr'],
  phonepe: ['ybl', 'ibl', 'axl'],
  gpay: ['oksbi', 'okhdfcbank', 'okicici', 'okaxis', 'okyesbank'],
};

export function suggestedAppForVpa(vpa: string | undefined): UpiApp {
  if (!vpa || !vpa.includes('@')) return 'other';
  const handle = vpa.slice(vpa.lastIndexOf('@') + 1).toLowerCase();
  for (const [app, handles] of Object.entries(APP_HANDLES) as Array<[Exclude<UpiApp, 'other'>, string[]]>) {
    if (handles.includes(handle)) return app;
  }
  return 'other';
}

function queryOf(upiUrl: string): string {
  const queryIndex = upiUrl.indexOf('?');
  return queryIndex >= 0 ? upiUrl.slice(queryIndex) : '';
}

export function upiAppLinks(upiUrl: string | undefined): UpiAppLinks | undefined {
  if (!upiUrl) return undefined;
  if (!upiUrl.startsWith('upi://')) return { generic: upiUrl };
  const query = queryOf(upiUrl);
  return {
    generic: upiUrl,
    gpay: `gpay://upi/pay${query}`,
    phonepe: `phonepe://pay${query}`,
    paytm: `paytmmp://pay${query}`,
  };
}

export function preferredUpiUrl(links: UpiAppLinks | undefined, app: UpiApp | undefined): string | undefined {
  if (!links) return undefined;
  if (app === 'gpay') return links.gpay ?? links.generic;
  if (app === 'phonepe') return links.phonepe ?? links.generic;
  if (app === 'paytm') return links.paytm ?? links.generic;
  return links.generic;
}
