import { prisma } from "../src/utils/client";

/**
 * Script to remove duplicate items for a specific company
 * Keeps the earliest created item, deletes duplicates
 * Handles all foreign key constraints in proper deletion order
 */

const COMPANY_ID = "2abe10fd-9f65-4227-a672-9f3b091a3445";

async function removeCompanyDuplicates() {
  try {
    console.log(`🔄 Starting duplicate removal for company: ${COMPANY_ID}`);

    // 1. Remove all items with productCode: null (but delete their references first)
    console.log("\n📝 Step 1: Removing items with NULL productCode...");

    // First, find items with null productCode
    const nullProductItems = await prisma.items.findMany({
      where: {
        companyId: COMPANY_ID,
        productCode: null,
      },
      select: { id: true },
    });

    const nullProductIds = nullProductItems.map((item) => item.id);

    // Delete all related records before deleting items (in proper order to respect FK constraints)
    if (nullProductIds.length > 0) {
      // First find all StockReceipts for these items
      const nullStockReceipts = await prisma.stockReceipts.findMany({
        where: { itemId: { in: nullProductIds } },
        select: { id: true },
      });
      const nullStockReceiptIds = nullStockReceipts.map((sr) => sr.id);

      // Deletion order:
      // 1. Delete Approvals (depends on StockReceipts)
      if (nullStockReceiptIds.length > 0) {
        await prisma.approvals.deleteMany({
          where: { stockReceiptId: { in: nullStockReceiptIds } },
        });

        // 2. Delete Stock records (depends on StockReceipts)
        await prisma.stock.deleteMany({
          where: { stockReceiptId: { in: nullStockReceiptIds } },
        });
      }

      // 3. Delete StockReceipts
      await prisma.stockReceipts.deleteMany({
        where: { itemId: { in: nullProductIds } },
      });

      // 4. Delete SellItem records
      await prisma.sellItem.deleteMany({
        where: { itemId: { in: nullProductIds } },
      });

      // 5. Delete PurchaseOrderItem records
      await prisma.purchaseOrderItem.deleteMany({
        where: { itemId: { in: nullProductIds } },
      });

      // 6. Delete Sell records
      await prisma.sell.deleteMany({
        where: { itemId: { in: nullProductIds } },
      });
    }

    const nullProductResult = await prisma.items.deleteMany({
      where: {
        companyId: COMPANY_ID,
        productCode: null,
      },
    });
    console.log(
      `✓ Deleted ${nullProductResult.count} items with NULL productCode`,
    );

    // 2. Find all items with non-null productCode
    console.log("\n📝 Step 2: Finding items with productCode...");
    const items = await prisma.items.findMany({
      where: {
        companyId: COMPANY_ID,
        NOT: { productCode: null },
      },
      orderBy: { createdAt: "asc" },
    });

    console.log(`✓ Found ${items.length} items with productCode`);

    // 3. Group by [productCode, branchId]
    console.log("\n📝 Step 3: Grouping items by productCode and branchId...");
    const groupMap = new Map<string, typeof items>();
    for (const item of items) {
      const key = `${item.productCode}|${item.branchId || "null"}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(item);
    }

    console.log(
      `✓ Found ${groupMap.size} unique productCode + branchId combinations`,
    );

    // 4. For each group with duplicates, keep first and delete others
    console.log("\n📝 Step 4: Processing duplicates...");
    let totalDuplicatesRemoved = 0;
    let groupsWithDuplicates = 0;

    for (const [key, groupItems] of groupMap.entries()) {
      if (groupItems.length > 1) {
        groupsWithDuplicates++;
        const [kept, ...toDelete] = groupItems;
        console.log(
          `\n  📦 ProductCode: ${kept.productCode}, Branch: ${kept.branchId || "null"}`,
        );
        console.log(`    - Keeping: ${kept.id} (created: ${kept.createdAt})`);

        for (const item of toDelete) {
          console.log(
            `    - Deleting: ${item.id} (created: ${item.createdAt})`,
          );

          // Delete related transactions in proper order
          // Get all StockReceipts for this item first
          const stockReceipts = await prisma.stockReceipts.findMany({
            where: { itemId: item.id },
            select: { id: true },
          });
          const stockReceiptIds = stockReceipts.map((sr) => sr.id);

          // Deletion order to respect FK constraints:
          // 1. Delete Approvals (depends on StockReceipts)
          if (stockReceiptIds.length > 0) {
            const approvalsCount = await prisma.approvals.deleteMany({
              where: { stockReceiptId: { in: stockReceiptIds } },
            });
            if (approvalsCount.count > 0) {
              console.log(
                `      └─ Deleted ${approvalsCount.count} Approvals records`,
              );
            }

            // 2. Delete Stock records (depends on StockReceipts)
            const stockCount = await prisma.stock.deleteMany({
              where: {
                stockReceiptId: { in: stockReceiptIds },
              },
            });
            if (stockCount.count > 0) {
              console.log(`      └─ Deleted ${stockCount.count} Stock records`);
            }
          }

          // 3. Delete from StockReceipts
          const stockReceiptsCount = await prisma.stockReceipts.deleteMany({
            where: { itemId: item.id },
          });
          if (stockReceiptsCount.count > 0) {
            console.log(
              `      └─ Deleted ${stockReceiptsCount.count} StockReceipts records`,
            );
          }

          // 4. Delete from SellItem
          const sellItemsCount = await prisma.sellItem.deleteMany({
            where: { itemId: item.id },
          });
          if (sellItemsCount.count > 0) {
            console.log(
              `      └─ Deleted ${sellItemsCount.count} SellItem records`,
            );
          }

          // 4. Delete from PurchaseOrderItem
          const poItemsCount = await prisma.purchaseOrderItem.deleteMany({
            where: { itemId: item.id },
          });
          if (poItemsCount.count > 0) {
            console.log(
              `      └─ Deleted ${poItemsCount.count} PurchaseOrderItem records`,
            );
          }

          // 5. Delete all Sell records for this item
          const sellCount = await prisma.sell.deleteMany({
            where: { itemId: item.id },
          });
          if (sellCount.count > 0) {
            console.log(`      └─ Deleted ${sellCount.count} Sell records`);
          }

          // 6. Finally delete the duplicate item
          await prisma.items.delete({
            where: { id: item.id },
          });

          totalDuplicatesRemoved++;
          console.log(`      ✓ Deleted duplicate item`);
        }
      }
    }

    console.log("\n✅ Duplicate removal completed!");
    console.log(`📊 Summary:`);
    console.log(`  - Total items with productCode: ${items.length}`);
    console.log(`  - Groups with duplicates: ${groupsWithDuplicates}`);
    console.log(`  - Duplicate items removed: ${totalDuplicatesRemoved}`);
    console.log(
      `  - Items with NULL productCode removed: ${nullProductResult.count}`,
    );
    console.log(
      `  - Final unique items: ${items.length - totalDuplicatesRemoved}`,
    );
  } catch (error) {
    console.error("❌ Error during duplicate removal:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
removeCompanyDuplicates()
  .then(() => {
    console.log("\n🎉 Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
