import { useMemo } from "react";
import { buildEmailHtml, type EmailTemplateInput } from "@/lib/emailTemplate";

export function EmailPreviewFrame({ input }: { input: EmailTemplateInput }) {
  const html = useMemo(() => buildEmailHtml(input), [input]);
  return (
    <iframe
      title="Email preview"
      srcDoc={html}
      sandbox=""
      className="h-[620px] w-full rounded-lg border bg-background"
    />
  );
}
