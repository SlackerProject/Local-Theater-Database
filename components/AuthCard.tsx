export function AuthCard({
  title,
  children,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 justify-center px-4 py-10 md:py-16">
      <div className="flex w-full max-w-[440px] flex-col gap-5 self-start">
        <h1 className="display text-[40px]">{title}</h1>
        {children}
        {footer && <p className="m-0 border-t border-rule pt-4 text-[15px] text-muted">{footer}</p>}
      </div>
    </main>
  );
}

export function TextField({
  label,
  name,
  type = "text",
  defaultValue,
  autoComplete,
  hint,
  required = true,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  autoComplete?: string;
  hint?: string;
  required?: boolean;
}) {
  const id = `f-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        required={required}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="field h-12 px-3.5"
      />
      {hint && (
        <span id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </span>
      )}
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="callout m-0 text-[15px]">
      {message}
    </p>
  );
}

export function PrimaryButton({ children, pending }: { children: React.ReactNode; pending?: boolean }) {
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {children}
    </button>
  );
}
