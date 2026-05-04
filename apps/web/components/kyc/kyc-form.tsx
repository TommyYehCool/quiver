"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { submitKyc, type KycSubmitInput } from "@/lib/api/kyc";

type Step = 1 | 2 | 3 | 4;

interface FormState {
  legal_name: string;
  id_number: string;
  birth_date: string;
  country: string;
  id_front: File | null;
  id_back: File | null;
  selfie: File | null;
}

const COUNTRIES = ["TW", "US", "JP", "HK", "CN", "SG", "MY", "KR", "TH", "VN", "GB", "PH", "ID"];
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function KycForm({
  locale,
  previousReason,
}: {
  locale: string;
  previousReason: string | null;
}) {
  const t = useTranslations("kyc");
  const router = useRouter();

  const [step, setStep] = React.useState<Step>(1);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormState>({
    legal_name: "",
    id_number: "",
    birth_date: "",
    country: "TW",
    id_front: null,
    id_back: null,
    selfie: null,
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((s) => ({ ...s, [key]: value }));
  }

  const step1Valid =
    form.legal_name.trim().length > 0 &&
    form.id_number.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(form.birth_date) &&
    COUNTRIES.includes(form.country);
  const step2Valid = form.id_front !== null && form.id_back !== null;
  const step3Valid = form.selfie !== null;

  function next() {
    setError(null);
    setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
  }
  function prev() {
    setError(null);
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
  }

  async function handleSubmit() {
    if (!form.id_front || !form.id_back || !form.selfie) return;
    setSubmitting(true);
    setError(null);
    try {
      const input: KycSubmitInput = {
        legal_name: form.legal_name.trim(),
        id_number: form.id_number.trim(),
        birth_date: form.birth_date,
        country: form.country,
        id_front: form.id_front,
        id_back: form.id_back,
        selfie: form.selfie,
      };
      await submitKyc(input);
      router.push(`/${locale}/kyc`);
      router.refresh();
    } catch (e) {
      const code = (e as { code?: string }).code ?? "server.internalError";
      setError(code);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("subtitle")}</p>
      </div>

      {previousReason ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          <p className="font-medium">{t("rejected.title")}</p>
          <p className="mt-1">{previousReason}</p>
        </div>
      ) : null}

      <Stepper step={step} t={t} />

      <Card>
        {step === 1 && (
          <StepBasicInfo form={form} update={update} t={t} />
        )}
        {step === 2 && (
          <StepIdPhotos form={form} update={update} t={t} setError={setError} />
        )}
        {step === 3 && (
          <StepSelfie form={form} update={update} t={t} setError={setError} />
        )}
        {step === 4 && (
          <StepReview form={form} t={t} />
        )}
      </Card>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {t.has(`errors.${error}`) ? t(`errors.${error}` as never) : error}
        </p>
      ) : null}

      <div className="flex justify-between">
        <Button variant="outline" onClick={prev} disabled={step === 1 || submitting}>
          {t("nav.prev")}
        </Button>
        {step < 4 ? (
          <Button
            onClick={next}
            disabled={
              (step === 1 && !step1Valid) ||
              (step === 2 && !step2Valid) ||
              (step === 3 && !step3Valid)
            }
          >
            {t("nav.next")}
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("nav.submit")}
          </Button>
        )}
      </div>
    </div>
  );
}

function Stepper({ step, t }: { step: Step; t: ReturnType<typeof useTranslations> }) {
  const items = [
    { n: 1, label: t("step1.title") },
    { n: 2, label: t("step2.title") },
    { n: 3, label: t("step3.title") },
    { n: 4, label: t("step4.title") },
  ];
  return (
    <ol className="flex items-center gap-2">
      {items.map((it, i) => {
        const active = step === it.n;
        const done = step > it.n;
        return (
          <li key={it.n} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-medium",
                done && "bg-brand text-white",
                active && "bg-brand-gradient text-white",
                !done && !active && "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
              )}
            >
              {done ? <CheckCircle2 className="h-4 w-4" /> : it.n}
            </div>
            <span
              className={cn(
                "hidden text-xs sm:inline",
                active ? "font-medium text-slate-ink dark:text-white" : "text-slate-500",
              )}
            >
              {it.label}
            </span>
            {i < items.length - 1 ? (
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function StepBasicInfo({
  form,
  update,
  t,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <>
      <CardHeader>
        <CardTitle>{t("step1.title")}</CardTitle>
        <CardDescription>{t("step1.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="legal_name">{t("fields.legalName")}</Label>
          <Input
            id="legal_name"
            value={form.legal_name}
            onChange={(e) => update("legal_name", e.target.value)}
            placeholder={t("fields.legalNamePlaceholder")}
            maxLength={255}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="id_number">{t("fields.idNumber")}</Label>
          <Input
            id="id_number"
            value={form.id_number}
            onChange={(e) => update("id_number", e.target.value)}
            placeholder={t("fields.idNumberPlaceholder")}
            maxLength={64}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="birth_date">{t("fields.birthDate")}</Label>
            <Input
              id="birth_date"
              type="date"
              value={form.birth_date}
              onChange={(e) => update("birth_date", e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="country">{t("fields.country")}</Label>
            <select
              id="country"
              value={form.country}
              onChange={(e) => update("country", e.target.value)}
              className="flex h-11 w-full rounded-xl border border-cream-edge bg-paper px-3 py-2 text-sm text-slate-ink shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardContent>
    </>
  );
}

function StepIdPhotos({
  form,
  update,
  t,
  setError,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  t: ReturnType<typeof useTranslations>;
  setError: (e: string | null) => void;
}) {
  return (
    <>
      <CardHeader>
        <CardTitle>{t("step2.title")}</CardTitle>
        <CardDescription>{t("step2.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <FilePicker
          id="id_front"
          label={t("fields.idFront")}
          file={form.id_front}
          onChange={(f) => update("id_front", f)}
          t={t}
          setError={setError}
        />
        <FilePicker
          id="id_back"
          label={t("fields.idBack")}
          file={form.id_back}
          onChange={(f) => update("id_back", f)}
          t={t}
          setError={setError}
        />
      </CardContent>
    </>
  );
}

function StepSelfie({
  form,
  update,
  t,
  setError,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  t: ReturnType<typeof useTranslations>;
  setError: (e: string | null) => void;
}) {
  return (
    <>
      <CardHeader>
        <CardTitle>{t("step3.title")}</CardTitle>
        <CardDescription>{t("step3.desc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <FilePicker
          id="selfie"
          label={t("fields.selfie")}
          file={form.selfie}
          onChange={(f) => update("selfie", f)}
          t={t}
          setError={setError}
          capture="user"
        />
      </CardContent>
    </>
  );
}

function StepReview({
  form,
  t,
}: {
  form: FormState;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <>
      <CardHeader>
        <CardTitle>{t("step4.title")}</CardTitle>
        <CardDescription>{t("step4.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ReviewRow label={t("fields.legalName")} value={form.legal_name} />
        <ReviewRow label={t("fields.idNumber")} value={form.id_number} />
        <ReviewRow label={t("fields.birthDate")} value={form.birth_date} />
        <ReviewRow label={t("fields.country")} value={form.country} />
        <div className="grid grid-cols-3 gap-3">
          <FileThumb file={form.id_front} label={t("fields.idFront")} />
          <FileThumb file={form.id_back} label={t("fields.idBack")} />
          <FileThumb file={form.selfie} label={t("fields.selfie")} />
        </div>
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          {t("step4.notice")}
        </p>
      </CardContent>
    </>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 pb-2 text-sm last:border-0 dark:border-slate-800">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function FilePicker({
  id,
  label,
  file,
  onChange,
  t,
  setError,
  capture,
}: {
  id: string;
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
  t: ReturnType<typeof useTranslations>;
  setError: (e: string | null) => void;
  capture?: "user" | "environment";
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      onChange(null);
      return;
    }
    if (!ALLOWED_TYPES.includes(f.type)) {
      setError("kyc.fileFormatUnsupported");
      e.target.value = "";
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setError("kyc.fileTooLarge");
      e.target.value = "";
      return;
    }
    setError(null);
    onChange(f);
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex aspect-[4/3] w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-transparent transition-colors",
          file
            ? "border-brand/40 bg-brand/5"
            : "border-slate-300 hover:border-brand dark:border-slate-700",
        )}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 p-4 text-center text-slate-500">
            <Upload className="h-6 w-6" />
            <span className="text-xs">{t("upload.cta")}</span>
            <span className="text-xs">{t("upload.hint")}</span>
          </div>
        )}
      </button>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture={capture}
        className="sr-only"
        onChange={pick}
      />
    </div>
  );
}

function FileThumb({ file, label }: { file: File | null; label: string }) {
  const [src, setSrc] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div>
      <p className="mb-1 text-xs text-slate-500">{label}</p>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} className="aspect-[4/3] w-full rounded-lg object-cover" />
      ) : (
        <div className="aspect-[4/3] w-full rounded-lg bg-slate-100 dark:bg-slate-800" />
      )}
    </div>
  );
}
