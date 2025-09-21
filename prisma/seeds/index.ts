/* eslint-disable @typescript-eslint/no-explicit-any */
import { hashSync } from "bcrypt";
import { roles } from "../../src/utils/roles";
import { prisma } from "../../src/utils/client";

async function main() {
  try {
    console.log("SEEDING");
    // Seed Plans (use 'any' for data to avoid generated prisma type mismatches until client is regenerated)
    const plans = [
      {
        id: "essential",
        name: "Essential Partner",
        description:
          "Designed for small businesses, clinics, pharmacies, and solo practices (1-5 users, 1 location). Perfect for getting started with IRUCARE.",
        price: 60000,
        setupFee: 240000,
        additionalUser: 12000,
        additionalLocation: null,
        features: [
          "Software setup & user training included",
          "Data migration & initial configuration",
          "Unlimited data storage",
          "24/7 support access",
          "AI-powered tools & analytics",
          "Real-time business insights",
          "Regular software updates",
          "Partner portal access",
          "Basic training materials",
        ],
        period: "/month",
        userRange: "1-5 users",
        locationRange: "1 location",
      },
      {
        id: "professional",
        name: "Professional Partner",
        description:
          "Ideal for growing businesses and medical facilities with moderate staff and operations (6–20 users, 1–2 locations).",
        price: 180000,
        setupFee: 600000,
        additionalUser: 9600,
        additionalLocation: 60000,
        features: [
          "Everything in Essential, plus:",
          "Multi-location support (up to 2)",
          "Advanced user management",
          "Priority support channels",
          "Enhanced AI analytics",
          "Custom reporting tools",
          "Integration capabilities",
          "Co-marketing opportunities",
          "Dedicated partner manager",
          "Revenue sharing program",
        ],
        period: "/month",
        userRange: "6-20 users",
        locationRange: "1-2 locations",
      },
      {
        id: "enterprise",
        name: "Enterprise Partner",
        description:
          "Tailored for large businesses, commercial networks, hospitals, and healthcare institutions with large teams and complex logistics (21–60 users, up to 5 locations).",
        price: 480000,
        setupFee: 1200000,
        additionalUser: 8400,
        additionalLocation: 120000,
        features: [
          "Everything in Professional, plus:",
          "Multi-location support (up to 5)",
          "Advanced security features",
          "Complex logistics management",
          "Custom workflow automation",
          "Advanced integration support",
          "White-label solutions",
          "Joint go-to-market strategy",
          "Executive partner program",
          "Priority technical support",
        ],
        period: "/month",
        userRange: "21-60 users",
        locationRange: "Up to 5 locations",
      },
      {
        id: "ultimate",
        name: "Ultimate Partner",
        description:
          "Large-scale, multi-branch, high-demand stores, businesses, and healthcare systems (61–200 users, unlimited locations).",
        price: 1200000,
        setupFee: 2400000,
        additionalUser: 6000,
        additionalLocation: 180000,
        features: [
          "Everything in Enterprise, plus:",
          "Unlimited locations",
          "Custom pricing model",
          "Dedicated infrastructure",
          "Advanced customization",
          "24/7 premium support",
          "Custom development support",
          "Exclusive territory rights",
          "Maximum revenue sharing",
          "Strategic partnership benefits",
          "Annual planning sessions",
        ],
        period: "/month",
        userRange: "61-200 users",
        locationRange: "Unlimited locations",
      },
    ];

    await prisma.plan.createMany({ data: plans as any, skipDuplicates: true });
    // Create or update developer user (avoid duplicates)
    const developer = await prisma.user.upsert({
      where: { email: "gdushimimana6@gmail.com" },
      update: {},
      create: {
        email: "gdushimimana6@gmail.com",
        firstName: "D.Gilbert  ",
        lastName: "Developer",
        password: hashSync("Password123!", 10),
      },
    });

    // Ensure developer role exists for this user
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

    // Create or update admin user (avoid duplicates)
    const admin = await prisma.user.upsert({
      where: { email: "irubusinessgroup@gmail.com" },
      update: {},
      create: {
        email: "irubusinessgroup@gmail.com",
        firstName: "IRU Business Group  ",
        lastName: "Admin",
        password: hashSync("Password123!", 10),
      },
    });

    // Ensure admin role exists for this user
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
