export type WifiSecurity = "WPA" | "WEP" | "nopass";

export interface WifiOptions {
  ssid: string;
  password?: string;
  security?: WifiSecurity;
  hidden?: boolean;
}

export const escapeWifi = (value: string): string => value.replace(/[\\;,:"]/g, "\\$&");

export function wifiPayload({ ssid, password = "", security = "WPA", hidden = false }: WifiOptions): string {
  const fields = [`T:${security}`, `S:${escapeWifi(ssid)}`];
  if (security !== "nopass") fields.push(`P:${escapeWifi(password)}`);
  if (hidden) fields.push("H:true");
  return `WIFI:${fields.join(";")};;`;
}

export interface VCardOptions {
  firstName: string;
  lastName: string;
  org?: string;
  title?: string;
  phone?: string;
  email?: string;
  url?: string;
}

export const escapeVCard = (value: string): string =>
  value.replace(/[\\,;]/g, "\\$&").replace(/\r\n|\r|\n/g, "\\n");

const singleLine = (value: string): string => value.replace(/[\r\n]+/g, " ").trim();

export function vCardPayload(card: VCardOptions): string {
  const first = card.firstName.trim();
  const last = card.lastName.trim();
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${escapeVCard(last)};${escapeVCard(first)};;;`,
    `FN:${escapeVCard([first, last].filter(Boolean).join(" "))}`,
  ];
  const optional: [string, string | undefined, (value: string) => string][] = [
    ["ORG", card.org, escapeVCard],
    ["TITLE", card.title, escapeVCard],
    ["TEL;TYPE=CELL", card.phone, singleLine],
    ["EMAIL", card.email, singleLine],
    ["URL", card.url, singleLine],
  ];
  for (const [name, value, format] of optional) {
    const text = value?.trim();
    if (text) lines.push(`${name}:${format(text)}`);
  }
  lines.push("END:VCARD");
  return lines.join("\n");
}
