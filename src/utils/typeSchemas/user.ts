import z from "zod";

export const userSchema = z.object({
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
  firstName: z.string().min(3, {
    message: "First name must be at least 3 characters long.",
  }),
  lastName: z.string().min(3, {
    message: "Last name must be at least 3 characters long.",
  }),
  password: z
    .string()
    .regex(/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$ %^&*-]).{8,}$/, {
      message:
        "Password must be at least 8 characters long and include a lowercase letter, uppercase letter, number, and special symbol.",
    }),
});

export const loginSchema = z.object({
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
  password: z
    .string()
    .regex(/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$ %^&*-]).{8,}$/, {
      message:
        "Password must be at least 8 characters long and include a lowercase letter, uppercase letter, number, and special symbol.",
    }),
});
