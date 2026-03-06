import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function migrateTournaments() {
  console.log("🔄 Starting tournament status migration...");
  console.log("Converting SUBMITTED, APPROVED, REJECTED → PUBLISHED\n");

  try {
    // Convert all old statuses to PUBLISHED
    const result = await prisma.tournament.updateMany({
      where: {
        status: {
          in: ["SUBMITTED", "APPROVED", "REJECTED"],
        },
      },
      data: {
        status: "PUBLISHED",
        updatedAt: new Date(),
      },
    });

    console.log(
      `✅ Successfully migrated ${result.count} tournaments to PUBLISHED status\n`
    );

    // Show current distribution
    const statusCounts = await prisma.tournament.groupBy({
      by: ["status"],
      _count: {
        _all: true,
      },
    });

    console.log("📊 Current tournament status distribution:");
    console.log("─────────────────────────────────────────");

    if (statusCounts.length === 0) {
      console.log("  No tournaments found in database");
    } else {
      statusCounts.forEach((item: any) => {
        console.log(`  ${item.status}: ${item._count._all}`);
      });
    }

    console.log("─────────────────────────────────────────");
    console.log("\n✨ Migration complete!");
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrateTournaments()
  .then(() => {
    console.log("\n✅ Process exited successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Process failed:", error);
    process.exit(1);
  });
