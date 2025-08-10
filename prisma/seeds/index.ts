import { hashSync } from "bcrypt";
import { roles } from "../../src/utils/roles";
import { prisma } from "../../src/utils/client";

async function main() {
  try {
    console.log("SEEDING");
    const developer = await prisma.user.create({
      data: {
        email: "gdushimimana6@gmail.com",
        firstName: "D.Gilbert ",
        lastName: "Developer",
        password: hashSync("Password123!", 10),
      },
    });
    await prisma.userRole.create({
      data: {
        userId: developer.id,
        name: roles.DEVELOPER,
      },
    });
    const admin = await prisma.user.create({
      data: {
        email: "irubusinessgroup@gmail.com",
        firstName: "IRU Business Group ",
        lastName: "Admin",
        password: hashSync("Password123!", 10),
      },
    });
    await prisma.userRole.create({
      data: {
        userId: admin.id,
        name: roles.ADMIN,
      },
    });
    console.log("SEEDING COMPLETE");
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
