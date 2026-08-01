-- CreateTable
CREATE TABLE "admin_ticket_comments" (
    "id" SERIAL NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "author_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_ticket_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_ticket_comments_ticket_id_idx" ON "admin_ticket_comments"("ticket_id");

-- AddForeignKey
ALTER TABLE "admin_ticket_comments" ADD CONSTRAINT "admin_ticket_comments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "admin_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

