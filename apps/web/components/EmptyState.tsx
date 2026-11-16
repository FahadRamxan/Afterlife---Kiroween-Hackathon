import { Card } from '@afterlife/ui';

export function EmptyState({ title, body }: { title?: string; body: string }) {
  return (
    <Card data-testid="empty-state" className="mt-8 border-dashed text-center">
      {title ? <p className="font-semibold">{title}</p> : null}
      <p className="mt-1 text-sm text-bone/75">{body}</p>
    </Card>
  );
}
