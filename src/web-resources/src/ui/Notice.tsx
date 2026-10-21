import { ReactElement, useEffect, useRef } from "react";
import { Button, MessageBar, MessageBarActions, MessageBarBody } from "@fluentui/react-components";
import { Dismiss20Regular } from "@fluentui/react-icons";
import { t } from "../i18n";

export interface Msg {
  intent: "success" | "error" | "info" | "warning";
  text: string;
}

/** A message bar the user can close; success and info messages also disappear on their own. */
export function Notice({ message, onDismiss }: { message: Msg | null; onDismiss: () => void }): ReactElement | null {
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    if (!message || message.intent === "error" || message.intent === "warning") return;
    const timer = window.setTimeout(() => dismiss.current(), 5000);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (!message) return null;
  return (
    <MessageBar intent={message.intent}>
      <MessageBarBody>{message.text}</MessageBarBody>
      <MessageBarActions containerAction={<Button appearance="transparent" size="small" icon={<Dismiss20Regular />} aria-label={t("dismiss")} title={t("dismiss")} onClick={onDismiss} />} />
    </MessageBar>
  );
}
