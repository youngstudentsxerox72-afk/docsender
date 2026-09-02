import { supabase } from "@/integrations/supabase/client";

export type AppSettings = {
  user_id: string;
  footer_image_data_url: string | null;
  subject_template: string;
  body_intro: string;
  sender_name: string;
};

export const DEFAULT_SETTINGS: Omit<AppSettings, "user_id"> = {
  footer_image_data_url: null,
  subject_template: "Scanned Document - {filename}",
  body_intro: "Please find the scanned document as requested.",
  sender_name: "Students Graphics",
};

export async function fetchSettings(userId: string): Promise<AppSettings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("user_id, footer_image_data_url, subject_template, body_intro, sender_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { user_id: userId, ...DEFAULT_SETTINGS };
  return data as AppSettings;
}

export async function saveSettings(userId: string, patch: Partial<AppSettings>) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
  if (error) throw error;
}

/** {filename} becomes the first file's name, with "(+N more)" when several files are attached. */
export function applySubjectTemplate(template: string, filenames: string[], ref?: string) {
  const first = filenames[0] ?? "";
  const label = filenames.length > 1 ? `${first} (+${filenames.length - 1} more)` : first;
  return template.replaceAll("{filename}", label).replaceAll("{reference}", ref ?? "").trim();
}
