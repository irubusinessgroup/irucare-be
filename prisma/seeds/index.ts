/* eslint-disable @typescript-eslint/no-explicit-any */
import { hashSync } from "bcrypt";
import { roles } from "../../src/utils/roles";
import { prisma } from "../../src/utils/client";

async function main() {
  try {
    console.log("SEEDING");

    // Create or update developer user (avoid duplicates)
    const developer = await prisma.user.upsert({
      where: { email: "gdushimimana6@gmail.com" },
      update: {},
      create: {
        email: "gdushimimana6@gmail.com",
        firstName: "IRUCARE ",
        lastName: "Developer",
        password: hashSync("Password123!", 10),
      },
    });

    const existingDevRole = await prisma.userRole.findFirst({
      where: { userId: developer.id, name: roles.DEVELOPER },
    });
    if (!existingDevRole) {
      await prisma.userRole.create({
        data: {
          userId: developer.id,
          name: roles.DEVELOPER,
        },
      });
    }

    const admin = await prisma.user.upsert({
      where: { email: "irubusinessgroup@gmail.com" },
      update: {},
      create: {
        email: "irubusinessgroup@gmail.com",
        firstName: "IRUCARE ",
        lastName: "Super admin",
        password: hashSync("Password123!", 10),
      },
    });

    const existingAdminRole = await prisma.userRole.findFirst({
      where: { userId: admin.id, name: roles.ADMIN },
    });
    if (!existingAdminRole) {
      await prisma.userRole.create({
        data: {
          userId: admin.id,
          name: roles.ADMIN,
        },
      });
    }

    console.log("✅ SEEDING COMPLETE (no plans — custom partnerships only)");
    console.log("📦 Developer created:");
    console.log(`   Email: gdushimimana6@gmail.com`);
    console.log(`   Password: Password123!`);
    console.log("📦 Super admin created:");
    console.log(`   Email: irubusinessgroup@gmail.com`);
    console.log(`   Password: Password123!`);
  } catch (error) {
    console.log("SEEDING FAILED", error);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
