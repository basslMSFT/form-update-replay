import { AttrLike, readValue, valuesEqual } from "./value-codec";
import { Step, StoredValue, isSupportedType } from "./model";

/** Minimal view of a form that the recorder needs. */
export interface FormLike {
  entityName: string;
  attributes: AttrLike[];
}

interface Tracked {
  attr: AttrLike;
  original: StoredValue;
  value: StoredValue;
  changed: boolean;
}

/**
 * Collects column changes on one form. Repeated edits of the same column collapse into one step, and a column that
 * ends up with its starting value produces no step.
 */
export class Recorder {
  private readonly tracked = new Map<string, Tracked>();
  private readonly order: string[] = [];
  private handlers: Array<{ attr: AttrLike; fn: (ctx: unknown) => void }> = [];
  private active = false;

  get isRecording(): boolean {
    return this.active;
  }

  start(form: FormLike): void {
    if (this.active) return;
    this.tracked.clear();
    this.order.length = 0;
    this.handlers = [];
    for (const attr of form.attributes) {
      if (!isSupportedType(attr.getAttributeType())) continue;
      const name = attr.getName();
      this.tracked.set(name, { attr, original: readValue(attr), value: readValue(attr), changed: false });
      const fn = (): void => this.onChange(name);
      attr.addOnChange(fn);
      this.handlers.push({ attr, fn });
    }
    this.active = true;
  }

  private onChange(name: string): void {
    const t = this.tracked.get(name);
    if (!t) return;
    t.value = readValue(t.attr);
    if (!t.changed) {
      t.changed = true;
      this.order.push(name);
    }
  }

  /** Steps recorded so far, without stopping. */
  snapshot(): Step[] {
    const steps: Step[] = [];
    for (const name of this.order) {
      const t = this.tracked.get(name)!;
      if (valuesEqual(t.original, t.value)) continue;
      const clear = t.value === null;
      steps.push({
        sortOrder: (steps.length + 1) * 10,
        operation: clear ? "clear" : "set",
        valueMode: "fixed",
        column: name,
        columnType: t.attr.getAttributeType(),
        ...(clear ? {} : { value: t.value }),
      });
    }
    return steps;
  }

  stop(): Step[] {
    const steps = this.snapshot();
    for (const { attr, fn } of this.handlers) attr.removeOnChange(fn);
    this.handlers = [];
    this.active = false;
    return steps;
  }
}
