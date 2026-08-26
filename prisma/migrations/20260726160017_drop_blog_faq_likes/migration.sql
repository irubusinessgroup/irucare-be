/*
  Warnings:

  - You are about to drop the `Blog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Faq` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Likes` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Services` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Likes" DROP CONSTRAINT "Likes_blogId_fkey";

-- DropForeignKey
ALTER TABLE "Likes" DROP CONSTRAINT "Likes_userId_fkey";

-- DropTable
DROP TABLE "Blog";

-- DropTable
DROP TABLE "Faq";

-- DropTable
DROP TABLE "Likes";

-- DropTable
DROP TABLE "Services";
