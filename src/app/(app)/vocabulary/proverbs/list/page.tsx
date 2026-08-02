"use client";

import { VocabularyCategoryList } from "~/components/vocabulary-category-list";

export default function ProverbsListPage() {
  return (
    <VocabularyCategoryList
      category="PROVERB"
      addHref="/vocabulary/proverbs"
      detailHref={(id) => `/vocabulary/proverbs/${id}`}
    />
  );
}
