export const Panel = ({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section className="space-y-3">
    <div className="flex items-start justify-between gap-2">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {action}
    </div>
    <div className="rounded-2xl bg-background p-5">{children}</div>
  </section>
);
