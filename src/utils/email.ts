import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

export const sendEmail = async ({
  to,
  subject,
  body,
  html,
}: {
  to: string;
  subject: string;
  body?: string;
  html?: string;
}) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"IRUCARE" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text: body,
    html,
  });
};

export type TemplateVars = Record<string, string | number | null | undefined>;

export const renderTemplate = (
  templateRelativePath: string,
  variables: TemplateVars,
): string => {
  const templatesDir = path.resolve(process.cwd(), "src", "templates");
  const templatePath = path.join(templatesDir, templateRelativePath);
  const raw = fs.readFileSync(templatePath, { encoding: "utf-8" });
  return raw.replace(/{{\s*([\w.]+)\s*}}/g, (_match, key: string) => {
    const value = variables[key as keyof TemplateVars];
    return value === null || value === undefined ? "" : String(value);
  });
};
