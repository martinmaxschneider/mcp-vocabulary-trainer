"use client";

import { VocabularyCategoryList } from "~/components/vocabulary-category-list";

export default function NounsListPage() {
  return (
    <VocabularyCategoryList
      category="NOUN"
      addHref="/vocabulary/nouns"
      detailHref={(id) => `/vocabulary/nouns/${id}`}
    />
  );
}
