import { supabase } from "@/integrations/supabase/client";

export type AppSettings = {
  user_id: string;
  footer_image_data_url: string | null;
  subject_template: string;
  body_intro: string;
  sender_name: string;
  max_upload_mb: number;
  allowed_types: string[];
};

export const DEFAULT_SETTINGS: Omit<AppSettings, "user_id"> = {
  footer_image_data_url: null,
  subject_template: "Scanned Document - {filename}",
  body_intro: "Please find the scanned document as requested.",
  sender_name: "Students Graphics",
  max_upload_mb: 20,
  allowed_types: ["pdf", "docx"],
};

export async function fetchSettings(userId: string): Promise<AppSettings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("*")
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

export function applySubjectTemplate(template: string, filename: string, ref?: string) {
  return template
    .replaceAll("{filename}", filename)
    .replaceAll("{reference}", ref ?? "")
    .trim();
}
