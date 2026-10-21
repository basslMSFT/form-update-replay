import { ReactElement } from "react";
import { Input, Select, Text, Textarea, makeStyles, tokens } from "@fluentui/react-components";
import { CalcSpec, DateUnit, NumberOp, calcKindFor } from "../calc";
import { ColumnInfo } from "../compat";
import { Field } from "./fields";
import { t } from "../i18n";

const useStyles = makeStyles({
  box: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
  row: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS },
  grow: { flexGrow: 1, minWidth: "120px" },
  muted: { color: tokens.colorNeutralForeground3 },
  summary: {
    backgroundColor: tokens.colorBrandBackground2, borderLeft: `3px solid ${tokens.colorBrandBackground}`, borderRadius: tokens.borderRadiusSmall,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
  },
});

const UNITS: Array<{ value: DateUnit; key: "unitDays" | "unitWeeks" | "unitMonths" | "unitYears" | "unitWorkdays" }> = [
  { value: "days", key: "unitDays" },
  { value: "weeks", key: "unitWeeks" },
  { value: "months", key: "unitMonths" },
  { value: "years", key: "unitYears" },
  { value: "workdays", key: "unitWorkdays" },
];

const NUMERIC = ["integer", "decimal", "double", "money"];

interface Props {
  /** The column the step sets. */
  column: string;
  columnType: string;
  spec: CalcSpec;
  onChange: (spec: CalcSpec) => void;
  columns: ColumnInfo[];
}

/** One-line description of a calculation, for the editor and for summaries. */
export function describeCalc(spec: CalcSpec, labelOf: (column: string) => string): string {
  const num = (n: number): string => (n < 0 ? `- ${Math.abs(n)}` : `+ ${n}`);
  if (spec.kind === "date") {
    const base = spec.base.source === "now" ? t("calcBaseNow") : spec.base.source === "current" ? t("calcBaseCurrent") : spec.base.source === "column" ? labelOf(spec.base.column) : spec.base.value;
    const unit = t(UNITS.find((u) => u.value === spec.unit)!.key);
    return `${base} ${num(spec.amount)} ${unit}`;
  }
  if (spec.kind === "text") {
    const mode = spec.mode === "append" ? t("calcAppend") : spec.mode === "prepend" ? t("calcPrepend") : t("calcReplace");
    return `${mode}: ${spec.text}`;
  }
  const base = spec.base.source === "current" ? t("calcBaseCurrent") : spec.base.source === "column" ? labelOf(spec.base.column) : String(spec.base.value);
  const operand = spec.operand.source === "column" ? labelOf(spec.operand.column) : String(spec.operand.value);
  const sign = spec.op === "add" ? "+" : spec.op === "subtract" ? "-" : spec.op === "multiply" ? "×" : "+";
  return spec.op === "percent" ? `${base} ${sign} ${operand}%` : `${base} ${sign} ${operand}`;
}

/** Editor for the settings of a Calculate step; the kind of calculation follows the type of the column. */
export function CalcEditor({ column, columnType, spec, onChange, columns }: Props): ReactElement {
  const s = useStyles();
  const labelOf = (c: string): string => columns.find((x) => x.name === c)?.label ?? c;
  const ofType = (types: string[]): ColumnInfo[] => columns.filter((c) => types.includes(c.type) && c.name !== column).sort((a, b) => a.label.localeCompare(b.label));
  const columnSelect = (value: string, types: string[], set: (c: string) => void): ReactElement => {
    const options = ofType(types);
    return (
      <Field size="small" label={t("calcColumn")} className={s.grow} required validationState={value ? "none" : "warning"} validationMessage={value ? undefined : options.length ? t("calcPickColumn") : t("calcNoColumn")}>
        <Select size="small" value={value} onChange={(_, d) => set(d.value)}>
          <option value="">{t("calcPickColumn")}</option>
          {value && !options.some((o) => o.name === value) ? <option value={value}>{labelOf(value)} ({value})</option> : null}
          {options.map((o) => <option key={o.name} value={o.name}>{o.label} ({o.name})</option>)}
        </Select>
      </Field>
    );
  };

  if (calcKindFor(columnType) !== spec.kind) return <Text className={s.muted}>{t("skipCalcInvalid")}</Text>;

  if (spec.kind === "date") {
    const base = spec.base;
    return (
      <div className={s.box}>
        <div className={s.row}>
          <Field size="small" label={t("calcBase")} className={s.grow}>
            <Select
              size="small"
              value={base.source}
              onChange={(_, d) => {
                const source = d.value as typeof base.source;
                onChange({ ...spec, base: source === "column" ? { source, column: "" } : source === "fixed" ? { source, value: "" } : { source } });
              }}
            >
              <option value="now">{t("calcBaseNow")}</option>
              <option value="current">{t("calcBaseCurrent")}</option>
              <option value="column">{t("calcBaseColumn")}</option>
              <option value="fixed">{t("calcBaseFixed")}</option>
            </Select>
          </Field>
          {base.source === "column" ? columnSelect(base.column, ["datetime"], (c) => onChange({ ...spec, base: { source: "column", column: c } })) : null}
          {base.source === "fixed" ? (
            <Field size="small" label={t("calcBaseFixed")} className={s.grow} required validationState={base.value ? "none" : "warning"}>
              <Input size="small" type="date" value={base.value} onChange={(_, d) => onChange({ ...spec, base: { source: "fixed", value: d.value } })} />
            </Field>
          ) : null}
        </div>
        <div className={s.row}>
          <Field size="small" label={t("calcAmount")} className={s.grow}>
            <Input size="small" type="number" value={String(spec.amount)} onChange={(_, d) => onChange({ ...spec, amount: d.value === "" ? 0 : Math.trunc(Number(d.value)) })} />
          </Field>
          <Field size="small" label={t("calcUnit")} className={s.grow}>
            <Select size="small" value={spec.unit} onChange={(_, d) => onChange({ ...spec, unit: d.value as DateUnit })}>
              {UNITS.map((u) => <option key={u.value} value={u.value}>{t(u.key)}</option>)}
            </Select>
          </Field>
        </div>
        <div className={s.summary}><Text size={200} weight="semibold">{describeCalc(spec, labelOf)}.</Text> <Text size={200}>{t("calcNote")}</Text></div>
      </div>
    );
  }

  if (spec.kind === "text") {
    const insert = (token: string): void => onChange({ ...spec, text: spec.text + `{{${token}}}` });
    const textColumns = columns.filter((c) => c.name !== column).sort((a, b) => a.label.localeCompare(b.label));
    return (
      <div className={s.box}>
        <div className={s.row}>
          <Field size="small" label={t("calcTextMode")} className={s.grow}>
            <Select size="small" value={spec.mode} onChange={(_, d) => onChange({ ...spec, mode: d.value as typeof spec.mode })}>
              <option value="append">{t("calcAppend")}</option>
              <option value="prepend">{t("calcPrepend")}</option>
              <option value="replace">{t("calcReplace")}</option>
            </Select>
          </Field>
          {spec.mode !== "replace" ? (
            <Field size="small" label={t("calcSeparator")} className={s.grow}>
              <Select size="small" value={spec.separator} onChange={(_, d) => onChange({ ...spec, separator: d.value as typeof spec.separator })}>
                <option value="none">{t("sepNone")}</option>
                <option value="space">{t("sepSpace")}</option>
                {columnType === "memo" ? <option value="newline">{t("sepNewline")}</option> : null}
              </Select>
            </Field>
          ) : null}
        </div>
        <Field size="small" label={t("calcText")} required validationState={spec.text.trim() ? "none" : "warning"} hint={t("calcTextHint")}>
          <Textarea size="small" value={spec.text} onChange={(_, d) => onChange({ ...spec, text: d.value })} />
        </Field>
        <Field size="small" label={t("calcInsert")}>
          <Select size="small" value="" onChange={(_, d) => { if (d.value) insert(d.value); }}>
            <option value="" />
            <option value="today">today</option>
            <option value="now">now</option>
            <option value="user">user</option>
            {textColumns.map((c) => <option key={c.name} value={c.name}>{c.label} ({c.name})</option>)}
          </Select>
        </Field>
        <div className={s.summary}><Text size={200}>{t("calcNote")}</Text></div>
      </div>
    );
  }

  const base = spec.base;
  const operand = spec.operand;
  return (
    <div className={s.box}>
      <div className={s.row}>
        <Field size="small" label={t("calcBase")} className={s.grow}>
          <Select
            size="small"
            value={base.source}
            onChange={(_, d) => {
              const source = d.value as typeof base.source;
              onChange({ ...spec, base: source === "column" ? { source, column: "" } : source === "value" ? { source, value: 0 } : { source } });
            }}
          >
            <option value="current">{t("calcBaseCurrent")}</option>
            <option value="column">{t("calcBaseColumn")}</option>
            <option value="value">{t("calcBaseNumber")}</option>
          </Select>
        </Field>
        {base.source === "column" ? columnSelect(base.column, NUMERIC, (c) => onChange({ ...spec, base: { source: "column", column: c } })) : null}
        {base.source === "value" ? (
          <Field size="small" label={t("calcBaseNumber")} className={s.grow}>
            <Input size="small" type="number" value={String(base.value)} onChange={(_, d) => onChange({ ...spec, base: { source: "value", value: d.value === "" ? 0 : Number(d.value) } })} />
          </Field>
        ) : null}
      </div>
      <div className={s.row}>
        <Field size="small" label={t("calcOperation")} className={s.grow}>
          <Select size="small" value={spec.op} onChange={(_, d) => onChange({ ...spec, op: d.value as NumberOp })}>
            <option value="add">{t("opAdd")}</option>
            <option value="subtract">{t("opSubtract")}</option>
            <option value="multiply">{t("opMultiply")}</option>
            <option value="percent">{t("opPercent")}</option>
          </Select>
        </Field>
        <Field size="small" label={t("calcOperand")} className={s.grow}>
          <Select size="small" value={operand.source} onChange={(_, d) => onChange({ ...spec, operand: d.value === "column" ? { source: "column", column: "" } : { source: "value", value: 0 } })}>
            <option value="value">{t("calcOperandNumber")}</option>
            <option value="column">{t("calcOperandColumn")}</option>
          </Select>
        </Field>
      </div>
      {operand.source === "column"
        ? columnSelect(operand.column, NUMERIC, (c) => onChange({ ...spec, operand: { source: "column", column: c } }))
        : (
          <Field size="small" label={t("calcOperand")}>
            <Input size="small" type="number" value={String(operand.value)} onChange={(_, d) => onChange({ ...spec, operand: { source: "value", value: d.value === "" ? 0 : Number(d.value) } })} />
          </Field>
        )}
      <div className={s.summary}><Text size={200} weight="semibold">{describeCalc(spec, labelOf)}.</Text> <Text size={200}>{t("calcNote")}</Text></div>
    </div>
  );
}
