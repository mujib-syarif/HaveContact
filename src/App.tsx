import { useState, type FormEvent, type ReactNode } from "react";
import ReportForm from "./ReportForm";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import AdminPanel from "./AdminPanel";
import { Search, ShieldCheck, Phone, Flag, Users, ArrowUpRight, Menu, X, Globe2, LockKeyhole } from "lucide-react";

type LookupResult = {
  number: string;
  status: "reported" | "no_community_reports";
  reportCount: number;
  categories: { name: string; count: number }[];
  identity: null;
  metadata: { country: string | null; countryCallingCode: string; nationalNumber: string; numberType: string | null; valid: boolean } | null;
  disclaimer: string;
};
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

function normalizePhone(value: string): string | null {
  const parsed = parsePhoneNumberFromString(value.trim(), "ID");
  return parsed?.isValid() ? parsed.number : null;
};