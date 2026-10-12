import { z } from "zod";
import { CLIENT_CODE_PATTERN } from "@/lib/constants";
import { CLIENT_REGIONS, CURRENCIES } from "@/lib/types";
import { isHttpUrl } from "@/lib/utils";

/** zod schemas for clients (W2 commercial). Shared by the actions and the ClientDialog. */

export const CLIENT_NAME_MAX = 120;
export const CLIENT_SYSTEMS_MAX = 30;
export const CLIENT_SYSTEM_NAME_MAX = 60;

const emptyToNull = (value: unknown): unknown => (typeof value === "string" && value.trim() === "" ? null : value);

/** "company.com" -> "https://company.com"; "" -> null. */
const normaliseWebsite = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const optionalText = (max: number, label: string) =>
  z
    .preprocess(emptyToNull, z.string().trim().max(max, `${label} must be ${max} characters or fewer`).nullable())
    .optional();

export const clientNameSchema = z
  .string({ error: "Give the client a name" })
  .trim()
  .min(1, "Give the client a name")
  .max(CLIENT_NAME_MAX, `Names must be ${CLIENT_NAME_MAX} characters or fewer`);

export const clientCodeSchema = z
  .string({ error: "Give the client a short code" })
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(CLIENT_CODE_PATTERN, "Use 2-6 letters or digits, starting with a letter (e.g. HOSP)"));

const clientFields = z.object({
  name: clientNameSchema,
  code: clientCodeSchema,
  industry: z.string().trim().max(60, "Industry must be 60 characters or fewer").optional(),
  region: z.enum(CLIENT_REGIONS, { error: "Choose a region" }).optional(),
  currency: z.enum(CURRENCIES, { error: "Choose a currency" }).optional(),
  website: z
    .preprocess(
      normaliseWebsite,
      z.string().max(200, "Website must be 200 characters or fewer").refine(isHttpUrl, "Enter a valid website").nullable(),
    )
    .optional(),
  contact_name: optionalText(80, "Contact name"),
  contact_email: z
    .preprocess(
      (value) => (typeof value === "string" ? emptyToNull(value.trim().toLowerCase()) : value),
      z.email("Enter a valid email address").max(254, "Email must be 254 characters or fewer").nullable(),
    )
    .optional(),
  contact_role: optionalText(80, "Contact role"),
  systems: z
    .array(
      z
        .string()
        .trim()
        .min(1, "System names cannot be empty")
        .max(CLIENT_SYSTEM_NAME_MAX, `System names must be ${CLIENT_SYSTEM_NAME_MAX} characters or fewer`),
    )
    .max(CLIENT_SYSTEMS_MAX, `List at most ${CLIENT_SYSTEMS_MAX} systems`)
    .optional(),
  nda_signed: z.boolean().optional(),
  dpa_signed: z.boolean().optional(),
  confidential: z.boolean().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a valid colour").optional(),
  notes: z.string().trim().max(5000, "Notes must be 5000 characters or fewer").optional(),
});

export const createClientSchema = clientFields;

export const updateClientSchema = clientFields.partial().extend({
  archived: z.boolean().optional(),
});

export type CreateClientSchemaInput = z.output<typeof createClientSchema>;
export type UpdateClientSchemaInput = z.output<typeof updateClientSchema>;
