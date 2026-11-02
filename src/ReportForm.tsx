import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { parsePhoneNumberFromString } from "libphonenumber-js";

declare global {
  interface Window {
    turnstile?: {
      render: (node: HTMLElement, options: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void }) => string;
      remove: (id: string) => void;
    };
  }
}
const API = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";

function normalize(value: string): string | null {
  const parsed = parsePhoneNumberFromString(value.trim(), "ID");
  return parsed?.isValid() ? parsed.number : null;
}
