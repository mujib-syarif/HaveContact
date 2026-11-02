import { parsePhoneNumberFromString } from "libphonenumber-js/max";

export type PhoneMetadata = {
  country: string | null;
  countryCallingCode: string;
  nationalNumber: string;
  numberType: string | null;
  valid: boolean;
};

export function normalizePhone(value: unknown, defaultCountry = "ID"): string | null {
  if (typeof value !== "string") return null;
  const parsed = parsePhoneNumberFromString(value.trim(), defaultCountry as "ID");
  return parsed?.isValid() ? parsed.number : null;
}

export function getPhoneMetadata(phone: string): PhoneMetadata | null {
  const parsed = parsePhoneNumberFromString(phone);
  if (!parsed) return null;
  return {
    country: parsed.country ?? null,
    countryCallingCode: parsed.countryCallingCode,
    nationalNumber: parsed.nationalNumber,
    numberType: parsed.getType() ?? null,
    valid: parsed.isValid()
  };
}
