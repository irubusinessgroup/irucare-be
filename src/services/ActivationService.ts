import type { Request as ExpressRequest } from "express";
import type { Server as SocketIOServer } from "socket.io";
import archiver from "archiver";
import path from "path";
import {
  ActivationDocumentType,
  ActivationStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import { sendEmail } from "../utils/email";
import { roles } from "../utils/roles";
import { NotificationHelper } from "../utils/notificationHelper";
import type { RegistrationActivationDto } from "../utils/interfaces/common";

export const BASE_REQUIRED_DOCUMENTS: ActivationDocumentType[] = [
  "RDB_CERTIFICATE",
  "NATIONAL_ID",
  "VSDC_FORM",
  "USER_AGREEMENT",
];

const DOCUMENT_LABELS: Record<ActivationDocumentType, string> = {
  RDB_CERTIFICATE: "Business Registration / RDB Certificate",
  NATIONAL_ID: "National ID (owner or authorized representative)",
  VSDC_FORM: "RRA VSDC Form / Device Commitment Form",
  USER_AGREEMENT: "User Agreement with IRU BUSINESS GROUP",
  PREVIOUS_PROVIDER_TERMINATION: "Previous EBM/CIS provider termination",
};

const STATUS_LABELS: Record<ActivationStatus, string> = {
  DOCUMENTS_PENDING: "Documents pending",
  SUBMITTED: "Submitted for review",
  CHANGES_REQUESTED: "Changes requested",
  SENT_TO_RRA: "Sent to RRA (waiting for tracking code)",
  TRACKING_CODE_READY: "Tracking code ready",
  ACTIVATION_SCHEDULED: "RRA activation scheduled",
  ACTIVE: "Active",
  REJECTED: "Rejected",
};

const DEVICE_TYPES = ["MOBILE", "DESKTOP", "LAPTOP"] as const;

const activationInclude = {
  company: {
    select: {
      id: true,
      name: true,
      TIN: true,
      email: true,
      phoneNumber: true,
      industry: true,
      createdAt: true,
    },
  },
  documents: { orderBy: { uploadedAt: "asc" } },
  history: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.CompanyActivationInclude;

type ActivationWithRelations = Prisma.CompanyActivationGetPayload<{
  include: typeof activationInclude;
}>;

export type ActivationStatusValue =
  | "DOCUMENTS_PENDING"
  | "SUBMITTED"
  | "CHANGES_REQUESTED"
  | "SENT_TO_RRA"
  | "TRACKING_CODE_READY"
  | "ACTIVATION_SCHEDULED"
  | "ACTIVE"
  | "REJECTED";

export type AdminUpdateActivationStatusDto = {
  status: ActivationStatusValue;
  note?: string;
  rraTrackingCode?: string;
  activationDate?: string;
  activationVenue?: string;
};

export type ReviewActivationDocumentDto = {
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectReason?: string;
};

const notifyEmail = () =>
  process.env.ACTIVATION_NOTIFY_EMAIL || "irubusinessgroup@gmail.com";

const frontendUrl = () =>
  (process.env.FRONTEND_URL || "").split(",").map((s) => s.trim()).find(Boolean) ||
  "";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

const emailLayout = (title: string, bodyHtml: string) => `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1f2937">
  <h2 style="color:#1d4ed8;margin-bottom:8px">${escapeHtml(title)}</h2>
  ${bodyHtml}
  <p style="color:#6b7280;font-size:12px;margin-top:24px">IRUCARE · IRU BUSINESS GROUP</p>
</div>`;

export const zipNameForCompany = (companyName: string) => {
  const slug = companyName
    .toLowerCase()
    .replace(/\b(ltd|limited|llc|plc|co|inc)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "company"}.zip`;
};

export class ActivationService {
  static requiredDocuments(usedPreviousEbm: boolean): ActivationDocumentType[] {
    return usedPreviousEbm
      ? [...BASE_REQUIRED_DOCUMENTS, "PREVIOUS_PROVIDER_TERMINATION"]
      : BASE_REQUIRED_DOCUMENTS;
  }

  private static serialize(a: ActivationWithRelations) {
    const required = this.requiredDocuments(a.usedPreviousEbm);
    const missingDocuments = required.filter(
      (t) => !a.documents.some((d) => d.type === t && d.status !== "REJECTED"),
    );
    return {
      ...a,
      statusLabel: STATUS_LABELS[a.status],
      requiredDocuments: required.map((type) => ({
        type,
        label: DOCUMENT_LABELS[type],
      })),
      missingDocuments,
      zipFileName: zipNameForCompany(a.company.name),
    };
  }

  private static async findByIdOrThrow(id: string) {
    const activation = await prisma.companyActivation.findUnique({
      where: { id },
      include: activationInclude,
    });
    if (!activation) throw new AppError("Activation record not found", 404);
    return activation;
  }

  /**
   * Self-registration must include complete KYC. Throws before the company is created.
   */
  static validateRegistration(data: {
    certificate?: unknown;
    idAttachment?: unknown;
    activation?: RegistrationActivationDto;
  }) {
    const a = data.activation;
    if (!a) return;
    const problems: string[] = [];
    const isUrl = (v: unknown) => typeof v === "string" && /^https?:\/\//.test(v);
    const yes = (v?: string) => v === "true";

    if (!isUrl(data.certificate)) problems.push(DOCUMENT_LABELS.RDB_CERTIFICATE);
    if (!isUrl(data.idAttachment)) problems.push(DOCUMENT_LABELS.NATIONAL_ID);
    if (!a.documents?.VSDC_FORM) problems.push(DOCUMENT_LABELS.VSDC_FORM);
    if (!a.documents?.USER_AGREEMENT) problems.push(DOCUMENT_LABELS.USER_AGREEMENT);
    if (yes(a.usedPreviousEbm) && !a.documents?.PREVIOUS_PROVIDER_TERMINATION) {
      problems.push(DOCUMENT_LABELS.PREVIOUS_PROVIDER_TERMINATION);
    }
    const missingDocs = problems.length ? [`Missing documents: ${problems.join(", ")}`] : [];

    const other: string[] = [];
    if (!DEVICE_TYPES.includes(a.deviceType as any)) other.push("Select the device type");
    if (
      (a.deviceType === "DESKTOP" || a.deviceType === "LAPTOP") &&
      (!a.deviceContactName?.trim() || !a.deviceContactPhone?.trim())
    ) {
      other.push("Name the team member who will bring the device to RRA");
    }
    if (yes(a.usedPreviousEbm) && !a.previousProvider?.trim()) {
      other.push("Enter your previous EBM/CIS provider");
    }
    if (
      !yes(a.confirmedNoPendingTransactions) ||
      !yes(a.confirmedTinValid) ||
      !yes(a.confirmedPreviousEbmInstalled) ||
      !yes(a.acceptTerms)
    ) {
      other.push("Accept all EBM activation declarations");
    }

    const all = [...missingDocs, ...other];
    if (all.length) throw new AppError(all.join(" · "), 400);
  }

  /**
   * Called when a company is created. With registration KYC the request goes straight
   * to IRU review; companies created by a platform admin start at DOCUMENTS_PENDING.
   */
  static async createForCompany(
    companyId: string,
    seed: {
      certificate?: string | null;
      idAttachment?: string | null;
      activation?: RegistrationActivationDto;
    } = {},
  ) {
    const isUrl = (v?: string | null) => !!v && /^https?:\/\//.test(v);
    const documents: Prisma.ActivationDocumentCreateWithoutActivationInput[] = [];
    if (isUrl(seed.certificate)) {
      documents.push({ type: "RDB_CERTIFICATE", fileUrl: seed.certificate! });
    }
    if (isUrl(seed.idAttachment)) {
      documents.push({ type: "NATIONAL_ID", fileUrl: seed.idAttachment! });
    }

    const reg = seed.activation;
    if (!reg) {
      return prisma.companyActivation.upsert({
        where: { companyId },
        update: {},
        create: {
          companyId,
          documents: { create: documents },
          history: { create: { toStatus: "DOCUMENTS_PENDING", note: "Company registered" } },
        },
      });
    }

    for (const [type, url] of Object.entries(reg.documents ?? {})) {
      if (type in DOCUMENT_LABELS && isUrl(url)) {
        documents.push({ type: type as ActivationDocumentType, fileUrl: url! });
      }
    }
    const yes = (v?: string) => v === "true";
    const usedPreviousEbm = yes(reg.usedPreviousEbm);
    const now = new Date();

    const created = await prisma.companyActivation.create({
      data: {
        companyId,
        status: "SUBMITTED",
        submittedAt: now,
        deviceType: reg.deviceType,
        deviceContactName: reg.deviceContactName?.trim() || null,
        deviceContactPhone: reg.deviceContactPhone?.trim() || null,
        usedPreviousEbm,
        previousProvider: usedPreviousEbm ? reg.previousProvider?.trim() || null : null,
        confirmedNoPendingTransactions: yes(reg.confirmedNoPendingTransactions),
        confirmedTinValid: yes(reg.confirmedTinValid),
        confirmedPreviousEbmInstalled: yes(reg.confirmedPreviousEbmInstalled),
        acceptedTermsAt: yes(reg.acceptTerms) ? now : null,
        documents: { create: documents },
        history: { create: { toStatus: "SUBMITTED", note: "Submitted with company registration" } },
      },
      include: activationInclude,
    });

    this.notifyIruOfSubmission(created).catch((e) =>
      console.error("Activation submission email failed:", e),
    );
    return created;
  }

  /**
   * Access check used by gates. Companies registered before activation existed
   * have no record and keep access.
   */
  static async getAccessStatus(companyId: string) {
    const activation = await prisma.companyActivation.findUnique({
      where: { companyId },
      select: { status: true },
    });
    if (!activation) return { allowed: true, status: null as ActivationStatus | null };
    return {
      allowed: activation.status === "ACTIVE",
      status: activation.status,
    };
  }

  static async list(status?: string, search?: string) {
    const where: Prisma.CompanyActivationWhereInput = {};
    if (status && status in STATUS_LABELS) where.status = status as ActivationStatus;
    if (search?.trim()) {
      const q = search.trim();
      where.company = {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { TIN: { contains: q } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      };
    }
    const [rows, grouped] = await Promise.all([
      prisma.companyActivation.findMany({
        where,
        include: activationInclude,
        orderBy: [{ submittedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      }),
      prisma.companyActivation.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
    return {
      statusCode: 200,
      message: "Activations",
      data: { items: rows.map((r) => this.serialize(r)), counts },
    };
  }

  static async getById(id: string) {
    const a = await this.findByIdOrThrow(id);
    return { statusCode: 200, message: "Activation", data: this.serialize(a) };
  }

  static async reviewDocument(documentId: string, dto: ReviewActivationDocumentDto) {
    if (!["APPROVED", "REJECTED", "PENDING"].includes(dto.status)) {
      throw new AppError("Invalid document status", 400);
    }
    if (dto.status === "REJECTED" && !dto.rejectReason?.trim()) {
      throw new AppError("Give a reason when rejecting a document", 400);
    }
    const doc = await prisma.activationDocument.update({
      where: { id: documentId },
      data: {
        status: dto.status,
        rejectReason: dto.status === "REJECTED" ? dto.rejectReason!.trim() : null,
        reviewedAt: new Date(),
      },
    });
    return this.getById(doc.activationId);
  }

  static async updateStatus(
    id: string,
    dto: AdminUpdateActivationStatusDto,
    actorId: string | undefined,
    io?: SocketIOServer,
  ) {
    if (!(dto.status in STATUS_LABELS)) throw new AppError("Invalid status", 400);
    const a = await this.findByIdOrThrow(id);

    const data: Prisma.CompanyActivationUpdateInput = {
      status: dto.status,
      reviewedById: actorId,
    };

    switch (dto.status) {
      case "CHANGES_REQUESTED":
      case "REJECTED":
        if (!dto.note?.trim()) throw new AppError("Explain what the client must fix", 400);
        data.reviewNotes = dto.note.trim();
        break;
      case "TRACKING_CODE_READY":
        if (!dto.rraTrackingCode?.trim() && !a.rraTrackingCode) {
          throw new AppError("RRA tracking code is required", 400);
        }
        break;
      case "ACTIVATION_SCHEDULED": {
        const date = dto.activationDate ? new Date(dto.activationDate) : a.activationDate;
        if (!date || Number.isNaN(date.getTime())) {
          throw new AppError("Activation date is required", 400);
        }
        data.activationDate = date;
        break;
      }
      case "ACTIVE":
        data.activatedAt = new Date();
        break;
    }
    if (dto.rraTrackingCode?.trim()) data.rraTrackingCode = dto.rraTrackingCode.trim();
    if (dto.activationVenue !== undefined) {
      data.activationVenue = dto.activationVenue.trim() || null;
    }
    if (dto.status !== "CHANGES_REQUESTED" && dto.status !== "REJECTED" && dto.note?.trim()) {
      data.reviewNotes = dto.note.trim();
    }
    data.history = {
      create: { fromStatus: a.status, toStatus: dto.status, actorId, note: dto.note?.trim() || null },
    };

    const updated = await prisma.companyActivation.update({
      where: { id },
      data,
      include: activationInclude,
    });

    if (a.status !== updated.status) {
      this.notifyClientOfStatus(updated, io).catch((e) =>
        console.error("Activation status notification failed:", e),
      );
    }

    return { statusCode: 200, message: `Status set to ${STATUS_LABELS[updated.status]}`, data: this.serialize(updated) };
  }

  /** Successful RRA device initialization completes activation. */
  static async markActiveFromEbmInit(companyId: string) {
    const a = await prisma.companyActivation.findUnique({ where: { companyId } });
    if (!a || a.status === "ACTIVE") return;
    const updated = await prisma.companyActivation.update({
      where: { id: a.id },
      data: {
        status: "ACTIVE",
        activatedAt: new Date(),
        history: {
          create: { fromStatus: a.status, toStatus: "ACTIVE", note: "EBM device initialized" },
        },
      },
      include: activationInclude,
    });
    this.notifyClientOfStatus(updated).catch((e) =>
      console.error("Activation status notification failed:", e),
    );
  }

  static async streamZip(id: string, req: ExpressRequest) {
    const a = await this.findByIdOrThrow(id);
    if (!a.documents.length) throw new AppError("No documents uploaded yet", 404);

    const res = req.res!;
    const zipName = zipNameForCompany(a.company.name);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", (err) => {
      console.error("Activation ZIP failed:", err);
      res.destroy(err);
    });
    archive.pipe(res);

    for (const doc of a.documents) {
      const response = await fetch(doc.fileUrl);
      if (!response.ok) {
        archive.append(`Could not download ${doc.fileUrl} (HTTP ${response.status})`, {
          name: `${doc.type}-MISSING.txt`,
        });
        continue;
      }
      const ext =
        path.extname(doc.fileName || "") ||
        path.extname(new URL(doc.fileUrl).pathname) ||
        "";
      archive.append(Buffer.from(await response.arrayBuffer()), {
        name: `${doc.type}${ext}`,
      });
    }
    await archive.finalize();
  }

  // ───────────────────────── Notifications ─────────────────────────

  private static async companyAdmins(companyId: string) {
    return prisma.user.findMany({
      where: {
        company: { companyId },
        userRoles: { some: { name: roles.COMPANY_ADMIN } },
      },
      select: { id: true, email: true, firstName: true },
    });
  }

  private static async notifyIruOfSubmission(a: ActivationWithRelations) {
    const docs = a.documents
      .map(
        (d) =>
          `<li><a href="${d.fileUrl}">${escapeHtml(DOCUMENT_LABELS[d.type])}</a></li>`,
      )
      .join("");
    const html = emailLayout(
      `New EBM activation request — ${a.company.name}`,
      `<p><b>Company:</b> ${escapeHtml(a.company.name)}<br/>
         <b>TIN:</b> ${escapeHtml(a.company.TIN)}<br/>
         <b>Email / Phone:</b> ${escapeHtml(a.company.email)} / ${escapeHtml(a.company.phoneNumber)}<br/>
         <b>Device:</b> ${escapeHtml(a.deviceType || "-")}
         ${a.deviceContactName ? ` — ${escapeHtml(a.deviceContactName)} (${escapeHtml(a.deviceContactPhone || "")})` : ""}<br/>
         <b>Previous EBM/CIS:</b> ${a.usedPreviousEbm ? escapeHtml(a.previousProvider || "yes") : "No"}</p>
       <p><b>Documents</b></p><ul>${docs}</ul>
       <p>Review and download <b>${escapeHtml(zipNameForCompany(a.company.name))}</b> from
       <a href="${frontendUrl()}/dashboard/activations?id=${a.id}">Super Admin → Activations</a>.</p>`,
    );
    await sendEmail({
      to: notifyEmail(),
      subject: `EBM activation request: ${a.company.name}`,
      html,
    });
  }

  private static async notifyClientOfStatus(a: ActivationWithRelations, io?: SocketIOServer) {
    const admins = await this.companyAdmins(a.companyId);
    if (!admins.length) return;

    const lines: string[] = [`<p>Status: <b>${escapeHtml(STATUS_LABELS[a.status])}</b></p>`];
    if (a.reviewNotes) lines.push(`<p><b>Notes from IRUCARE:</b><br/>${escapeHtml(a.reviewNotes)}</p>`);
    if (a.status === "TRACKING_CODE_READY" && a.rraTrackingCode) {
      lines.push(`<p>RRA tracking code: <b>${escapeHtml(a.rraTrackingCode)}</b>. We will contact you to schedule the RRA HQ visit.</p>`);
    }
    if (a.status === "ACTIVATION_SCHEDULED" && a.activationDate) {
      lines.push(
        `<p>Activation visit: <b>${a.activationDate.toLocaleString("en-GB", { timeZone: "Africa/Kigali" })}</b>
         ${a.activationVenue ? ` at ${escapeHtml(a.activationVenue)}` : " at RRA Headquarters"}.
         Please bring the device${a.deviceContactName ? ` (designated: ${escapeHtml(a.deviceContactName)})` : ""}.</p>`,
      );
    }
    if (a.status === "CHANGES_REQUESTED") {
      lines.push(
        `<p>Please reply to this email with the corrected documents, or send them to
         <a href="mailto:${notifyEmail()}">${notifyEmail()}</a>.</p>`,
      );
    }
    if (a.status === "ACTIVE") {
      lines.push(`<p>Your EBM is active. <a href="${frontendUrl()}/dashboard">Open IRUCARE</a></p>`);
    }

    const html = emailLayout(`EBM activation update — ${a.company.name}`, lines.join(""));
    await Promise.allSettled(
      admins.map((u) =>
        sendEmail({
          to: u.email,
          subject: `IRUCARE activation: ${STATUS_LABELS[a.status]}`,
          html,
        }),
      ),
    );

    if (io) {
      await NotificationHelper.sendToUsers(
        io,
        admins.map((u) => u.id),
        "EBM activation update",
        STATUS_LABELS[a.status],
        a.status === "CHANGES_REQUESTED" || a.status === "REJECTED" ? "warning" : "info",
        "/dashboard",
        "CompanyActivation",
        a.id,
      );
    }
  }
}
