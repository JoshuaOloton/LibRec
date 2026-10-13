"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, inputClasses } from "@/components/ui/field";
import { genreLabel } from "@/lib/utils";
import type { BookFormState } from "@/server/actions/admin-books";

export type BookFormDefaults = {
  title?: string;
  author?: string;
  genres?: string[];
  description?: string;
  publicationYear?: string;
  isbn?: string;
  coverUrl?: string;
};

type Props = {
  action: (prev: BookFormState, formData: FormData) => Promise<BookFormState>;
  /** Every genre already in the catalogue, offered as checkboxes. */
  genreOptions: string[];
  defaults?: BookFormDefaults;
  submitLabel: string;
};

export function BookForm({ action, genreOptions, defaults = {}, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState<BookFormState, FormData>(action, {});
  const errors = state.fieldErrors ?? {};
  // After a failed submit, keep what the admin typed.
  const v = (key: Exclude<keyof BookFormDefaults, "genres"> | "newGenres") => {
    const typed = state.values?.[key];
    if (typeof typed === "string") return typed;
    return key === "newGenres" ? undefined : defaults[key];
  };
  const checked = (state.values?.genres as string[] | undefined) ?? defaults.genres ?? [];
  // Genres typed or checked earlier that are not in the catalogue yet still need a checkbox.
  const options = [...new Set([...genreOptions, ...checked])].sort();

  return (
    <form action={formAction} className="max-w-2xl space-y-5" noValidate>
      {state.error && (
        <p role="alert" className="border-l-[3px] border-danger bg-surface px-3 py-2 text-danger">
          {state.error}
        </p>
      )}

      <Field label="Title" name="title" defaultValue={v("title")} error={errors.title} required />
      <Field label="Author" name="author" defaultValue={v("author")} error={errors.author} required />

      <fieldset aria-describedby={errors.genres ? "genres-error" : undefined}>
        <legend className="mb-1.5 font-bold">Genres</legend>
        <ul className="grid max-h-56 grid-cols-2 gap-x-4 overflow-y-auto rounded-md border border-rule bg-surface p-2 sm:grid-cols-3">
          {options.map((g) => (
            <li key={g}>
              <label className="flex min-h-11 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  name="genres"
                  value={g}
                  defaultChecked={checked.includes(g)}
                  className="size-5 accent-shelf"
                />
                {genreLabel(g)}
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <Field
            label="Other genres"
            name="newGenres"
            defaultValue={v("newGenres")}
            hint="Optional. Separate with commas, for example: african literature, poetry."
          />
        </div>
        {errors.genres && (
          <p id="genres-error" className="mt-1.5 text-sm text-danger">
            {errors.genres}
          </p>
        )}
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="description" className="block font-bold">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={6}
          defaultValue={v("description")}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? "description-error" : "description-hint"}
          className={`${inputClasses} py-2`}
        />
        {errors.description ? (
          <p id="description-error" className="text-sm text-danger">
            {errors.description}
          </p>
        ) : (
          <p id="description-hint" className="text-sm text-ink-muted">
            Recommendations use the description, so a few sentences help.
          </p>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Year first published"
          name="publicationYear"
          inputMode="numeric"
          defaultValue={v("publicationYear")}
          error={errors.publicationYear}
        />
        <Field
          label="ISBN-10"
          name="isbn"
          defaultValue={v("isbn")}
          error={errors.isbn}
          hint="Optional. 10 characters."
        />
      </div>
      <Field
        label="Cover image link"
        name="coverUrl"
        type="url"
        defaultValue={v("coverUrl")}
        error={errors.coverUrl}
        hint="Optional. Without one, LibRec draws a cover from the title."
      />

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Link href="/admin/books" className={buttonClasses("secondary")}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
