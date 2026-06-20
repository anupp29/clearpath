import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, ApiError } from "../api/client";
import { Card } from "./ui/Card";
import { ErrorAlert } from "./ui/ErrorAlert";
import { LoadingSpinner } from "./ui/LoadingSpinner";

export function Documentation() {
  const [content, setContent] = useState<string | null>(null);
  const [source, setSource] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    api
      .getReadme()
      .then((res) => {
        setContent(res.content);
        setSource(res.source);
      })
      .catch((e: ApiError) => setError(e.message));
  };

  useEffect(() => {
    load();
  }, []);

  if (error) return <ErrorAlert message={error} onRetry={load} />;
  if (!content) return <LoadingSpinner label="Loading documentation…" />;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-cp-navy">Documentation</h2>
        <p className="mt-1 text-sm text-cp-muted">
          Full project README — architecture, EDA, modelling, deployment ({source}).
        </p>
      </div>

      <Card className="max-w-none overflow-x-auto">
        <article className="docs-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </article>
      </Card>
    </div>
  );
}
