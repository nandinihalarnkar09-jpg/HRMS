'use client';
import { Alert, Button } from '@/components/ui';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <Alert kind="error">Couldn&apos;t load this page. {error.digest ? `(ref ${error.digest})` : ''} Please try again.</Alert>
      <Button variant="secondary" onClick={reset}>Try again</Button>
    </div>
  );
}
