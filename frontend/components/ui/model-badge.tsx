import { Bot, Ghost } from "lucide-react";
import { modelLabel } from "@backend/lib/ai/modelName";
import { cn } from "@/lib/utils";

/**
 * Says plainly who wrote an AI answer: "Written by Llama 3.3 70B · Groq", or "Written without AI" when every
 * provider was busy and Necro answered with its own template (Ghost mode). Shown under every AI output.
 */
export function ModelBadge({ model, className }: { model: string | null | undefined; className?: string }) {
  const label = modelLabel(model);
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-[0.75rem] leading-4 text-subtle", className)}
      title={label ? `AI model: ${model}` : "No AI model answered; Necro wrote this from the article itself."}
    >
      {label ? <Bot aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} /> : <Ghost aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />}
      {label ? (
        <span>
          Written by <span className="font-medium text-copy">{label}</span>
        </span>
      ) : (
        "Written without AI"
      )}
    </span>
  );
}
