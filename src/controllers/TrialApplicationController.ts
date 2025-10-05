import {
  Body,
  Get,
  Middlewares,
  Patch,
  Path,
  Post,
  Query,
  Request,
  Res,
  Route,
  Security,
  Tags,
  TsoaResponse,
} from "tsoa";
import { Request as ExpressRequest } from "express";
import { TrialApplicationService } from "../services/TrialApplicationService ";
import {
  CreateTrialApplicationDto,
  UpdateTrialApplicationDto,
  SubmitFeedbackDto,
} from "../utils/interfaces/common";
import { checkRole } from "../middlewares";
import { roles } from "../utils/roles";
import { prisma } from "../utils/client";

@Route("/api/trial-applications")
@Tags("Trial Applications")
export class TrialApplicationController {
  @Post("/")
  public async createTrialApplication(
    @Body() data: CreateTrialApplicationDto,
    @Request() req: ExpressRequest,
  ) {
    const io = req.app.get("io");
    return TrialApplicationService.createTrialApplication(data, io);
  }

  @Get("/{id}")
  public async getTrialApplication(@Path() id: string) {
    return TrialApplicationService.getTrialApplication(id);
  }

  @Security("jwt")
  @Get("/")
  @Middlewares(checkRole(roles.ADMIN))
  public async getAllTrialApplications(
    @Query() status?: string,
    @Query() searchQuery?: string,
    @Query() limit?: number,
    @Query() page?: number,
  ) {
    return TrialApplicationService.getAllTrialApplications(
      status,
      searchQuery,
      limit,
      page,
    );
  }

  @Security("jwt")
  @Patch("/{id}/status")
  @Middlewares(checkRole(roles.ADMIN))
  public async updateTrialApplicationStatus(
    @Path() id: string,
    @Body() data: UpdateTrialApplicationDto,
    @Request() req: ExpressRequest,
  ) {
    const adminUserId = req.user?.id as string;
    return TrialApplicationService.updateTrialApplicationStatus(
      id,
      data,
      adminUserId,
    );
  }

  @Get("/{id}/nda/download")
  public async downloadNDA(
    @Path() id: string,
    @Res() res: TsoaResponse<200, Buffer>,
  ) {
    const pdfBuffer = await TrialApplicationService.generateNDA(id);
    const application = await prisma.trialApplication.findUnique({
      where: { id },
    });

    return res(200, pdfBuffer, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="IRUCARE_NDA_${application?.applicationNumber}.pdf"`,
    });
  }

  @Get("/{id}/nda/preview")
  public async previewNDA(
    @Path() id: string,
    @Res() res: TsoaResponse<200, Buffer>,
  ) {
    const pdfBuffer = await TrialApplicationService.generateNDA(id);
    const application = await prisma.trialApplication.findUnique({
      where: { id },
    });

    return res(200, pdfBuffer, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="IRUCARE_NDA_${application?.applicationNumber}.pdf"`,
      "Cache-Control": "no-store",
    });
  }

  @Post("/{id}/sign-nda")
  public async signNDA(
    @Path() id: string,
    @Body() data: { signature: string; signatureDate: string },
  ) {
    return TrialApplicationService.signNDA(id, data);
  }

  @Security("jwt")
  @Post("/{id}/feedback")
  public async submitFeedback(
    @Path() id: string,
    @Body() data: SubmitFeedbackDto,
  ) {
    return TrialApplicationService.submitFeedback(id, data);
  }
}
