import { Separator } from "@/components/ui/separator";
import { Children, Fragment } from "react";

export const SettingsStack = ({ children }: { children: React.ReactNode }) => (
  <div className="grid gap-10">{children}</div>
);

export const SettingsSection = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => {
  const rows = Children.toArray(children);

  return (
    <section className="grid gap-4">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="grid gap-4 rounded-2xl bg-(--settings-surface) p-5">
        {rows.map((row, index) => (
          <Fragment key={`settings-row-${index}`}>
            {index > 0 && <Separator />}
            {row}
          </Fragment>
        ))}
      </div>
    </section>
  );
};

export const SettingsRow = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2">
    <div className="grid min-w-0 gap-1">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <div className="max-w-prose text-sm leading-5 text-muted-foreground">
          {description}
        </div>
      )}
    </div>
    <div className="flex shrink-0 items-center justify-end">{children}</div>
  </div>
);
