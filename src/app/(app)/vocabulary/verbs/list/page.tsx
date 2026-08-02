"use client";

import { VocabularyCategoryList } from "~/components/vocabulary-category-list";

export default function VerbsListPage() {
  return (
    <VocabularyCategoryList
      category="VERB"
      addHref="/vocabulary/verbs"
      detailHref={(id) => `/vocabulary/verbs/${id}`}
    />
  );
}
