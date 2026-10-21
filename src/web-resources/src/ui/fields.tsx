import { ReactElement, isValidElement } from "react";
import { Field as FluentField, FieldProps } from "@fluentui/react-components";

/** Field with a semibold label, so labels stand out from the inputs on grey panels. */
export function Field(props: FieldProps): ReactElement {
  const { label, ...rest } = props;
  const bold = typeof label === "string" ? { children: label, weight: "semibold" as const } : label && !isValidElement(label) && typeof label === "object" ? { weight: "semibold" as const, ...label } : label;
  return <FluentField {...rest} label={bold} />;
}
