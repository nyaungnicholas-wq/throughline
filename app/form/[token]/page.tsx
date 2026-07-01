import Link from "next/link";
import { getPublicForm } from "@/lib/forms";
import { PublicFormClient } from "@/components/PublicFormClient";

export default async function PublicFormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pf = await getPublicForm(token);

  if (!pf) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Form unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">This form has been closed or doesn&apos;t exist.</p>
          <Link href="/" className="mt-5 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-800">Go to Throughline</Link>
        </div>
      </main>
    );
  }

  return <PublicFormClient token={token} title={pf.form.title} description={pf.form.description} orgName={pf.orgName} />;
}
