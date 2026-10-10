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
    <main className="flex flex-1 justify-center px-4 py-10 sm:py-16">
      <div className="flex w-full max-w-[440px] flex-col gap-5 self-start rounded-[14px] border border-rule bg-surface p-6 sm:p-8">
        <h1 className="m-0 font-serif text-[40px] font-normal leading-[1.05]">{title}</h1>
        {children}
        {footer && <p className="m-0 text-[15px] text-muted">{footer}</p>}
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
        className="field h-12 rounded-[10px] px-3.5"
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
    <p role="alert" className="m-0 rounded-[10px] border-[1.5px] border-accent/40 bg-accent/5 p-3 text-[15px] text-accent">
      {message}
    </p>
  );
}

export function PrimaryButton({ children, pending }: { children: React.ReactNode; pending?: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-[52px] cursor-pointer rounded-full border-0 bg-accent font-semibold text-white disabled:cursor-wait disabled:opacity-70"
    >
      {children}
    </button>
  );
}
