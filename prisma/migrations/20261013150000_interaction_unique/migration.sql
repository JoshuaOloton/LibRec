-- One BORROW and one RATE per patron and book (FR3: re-rating updates, never duplicates).
-- CreateIndex
CREATE UNIQUE INDEX "interactions_user_id_book_id_interaction_type_key" ON "interactions"("user_id", "book_id", "interaction_type");
