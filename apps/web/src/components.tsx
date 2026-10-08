// 覆盖 P01-P07：表单、弹窗、统计与空态组件。
import { useEffect, useRef, useState, type ReactNode } from "react";
export type Field = {
  name: string;
  label: string;
  type?: string;
  value?: any;
  required?: boolean;
  max?: number;
  min?: number;
  options?: { value: string; label: string }[];
};
export function Form({
  fields,
  onSubmit,
  label = "保存",
}: {
  fields: Field[];
  onSubmit: (value: any) => Promise<void>;
  label?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [dirty]);
  return (
    <form
      data-dirty={dirty}
      onChange={() => setDirty(true)}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const f = new FormData(e.currentTarget),
          values = Object.fromEntries(
            fields.map((field) => [
              field.name,
              field.type === "multiselect"
                ? f.getAll(field.name)
                : field.type === "number"
                  ? Number(f.get(field.name))
                  : f.get(field.name),
            ]),
          );
        setBusy(true);
        setError("");
        try {
          await onSubmit(values);
          setDirty(false);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {fields.map((f) => (
        <label className="field" key={f.name}>
          {f.label}
          {f.type === "textarea" ? (
            <textarea
              name={f.name}
              defaultValue={f.value || ""}
              maxLength={f.max}
              required={f.required}
            />
          ) : f.options ? (
            <select
              name={f.name}
              aria-label={f.label}
              required={f.required}
              multiple={f.type === "multiselect"}
              defaultValue={f.value ?? (f.type === "multiselect" ? [] : "")}
            >
              {f.options.map((o) => (
                <option value={o.value} key={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              name={f.name}
              type={f.type || "text"}
              defaultValue={f.value ?? ""}
              min={f.min}
              max={f.type === "number" ? f.max : undefined}
              maxLength={f.type === "number" ? undefined : f.max}
              step={f.type === "number" ? 1 : undefined}
              required={f.required}
            />
          )}
        </label>
      ))}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-footer">
        <button className="btn" disabled={busy}>
          {busy ? "正在保存…" : label}
        </button>
      </div>
    </form>
  );
}
export function Modal({
  title,
  children,
  onClose,
  error,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  error?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const unload = (e: BeforeUnloadEvent) => {
      if (ref.current?.querySelector('form[data-dirty="true"]')) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    ref.current?.showModal();
    return () => {
      window.removeEventListener("beforeunload", unload);
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        const dirty = ref.current?.querySelector('form[data-dirty="true"]');
        if (dirty && !confirm("确认关闭当前表单？未保存的内容会丢失。")) return;
        onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="close"
          aria-label="关闭弹窗"
          onClick={() => {
            if (
              ref.current?.querySelector('form[data-dirty="true"]') &&
              !confirm("确认关闭当前表单？未保存的内容会丢失。")
            )
              return;
            onClose();
          }}
        >
          ×
        </button>
      </div>
      {error && (
        <p className="error modal-error" role="alert">
          {error}
        </p>
      )}
      {children}
    </dialog>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <span>◎</span>
      {children}
    </div>
  );
}
export function Stat({
  label,
  value,
  unit = "",
  foot = "",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  foot?: string;
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-number">
        {value}
        <em>{unit}</em>
      </div>
      <small>{foot}</small>
    </div>
  );
}
export function Progress({ value }: { value: number }) {
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <i style={{ width: value + "%" }} />
    </div>
  );
}
