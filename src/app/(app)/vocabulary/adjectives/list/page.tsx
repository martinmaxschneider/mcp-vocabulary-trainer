"use client";

import { VocabularyCategoryList } from "~/components/vocabulary-category-list";

export default function AdjectivesListPage() {
  return (
    <VocabularyCategoryList
      category="ADJECTIVE"
      addHref="/vocabulary/adjectives"
      detailHref={(id) => `/vocabulary/adjectives/${id}`}
    />
  );
}
